(() => {
  if (window.__uiautoRecorderInjected) {
    console.log(
      "Playwright Recorder: Content script already initialized on",
      window.location.href,
    );
    return;
  }

  window.__uiautoRecorderInjected = true;

  let isRecording = false;
  let isAssertPicking = false;
  let isExtensionConnected = true;
  let pickHighlightBox = null;
  let pickBanner = null;
  let replayBanner = null;
  let replayClickRipple = null;
  let replayTargetTip = null;

  const REPLAY_TIMING = {
    scrollSettle: 750,
    beforeAction: 900,
    clickRippleLead: 450,
    afterClick: 750,
    afterInput: 650,
    afterAssert: 700,
  };

  console.log(
    "Playwright Recorder: Content script loaded on",
    window.location.href,
  );

  function checkConnection() {
    if (!chrome.runtime) {
      isExtensionConnected = false;
      return false;
    }
    return true;
  }

  function sendMessageSafely(message) {
    if (!checkConnection()) {
      console.log("Extension connection lost, not sending message");
      return;
    }

    console.log("Sending message to background:", message);
    try {
      chrome.runtime.sendMessage(message, function (response) {
        if (chrome.runtime.lastError) {
          console.log("Connection error:", chrome.runtime.lastError.message);
        } else {
          console.log("Message sent successfully, response:", response);
        }
      });
    } catch (e) {
      console.log("Failed to send message:", e);
      isExtensionConnected = false;
    }
  }

  const INTERACTIVE_ROLES = new Set([
    "button",
    "link",
    "menuitem",
    "tab",
    "checkbox",
    "radio",
    "switch",
    "combobox",
    "textbox",
    "searchbox",
    "option",
    "slider",
    "spinbutton",
  ]);

  const DATA_TEST_ATTRS = [
    "data-testid",
    "data-test",
    "data-test-id",
    "data-id",
    "data-automation",
    "data-cy",
    "data-qa",
  ];

  function getImplicitRole(element) {
    if (!element?.tagName) return null;
    const tag = element.tagName;
    const inputType = (element.type || "text").toLowerCase();
    const tagRoleMap = {
      BUTTON: "button",
      A: "link",
      SELECT: "combobox",
      TEXTAREA: "textbox",
      SUMMARY: "button",
      H1: "heading",
      H2: "heading",
      H3: "heading",
      H4: "heading",
      H5: "heading",
      H6: "heading",
      IMG: "img",
      NAV: "navigation",
      MAIN: "main",
      HEADER: "banner",
      FOOTER: "contentinfo",
    };
    if (tag === "INPUT") {
      const map = {
        checkbox: "checkbox",
        radio: "radio",
        button: "button",
        submit: "button",
        reset: "button",
        search: "searchbox",
        number: "spinbutton",
        range: "slider",
      };
      return map[inputType] || "textbox";
    }
    return tagRoleMap[tag] || null;
  }

  const GENERIC_CLASS_NAMES = new Set([
    "text",
    "content",
    "title",
    "main",
    "body",
    "item",
    "active",
    "icon",
    "label",
    "name",
    "value",
    "wrapper",
    "inner",
    "outer",
    "box",
    "cell",
    "row",
    "col",
    "left",
    "right",
  ]);

  const ROLE_QUERY = {
    button:
      'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], summary',
    link: 'a[href], [role="link"]',
    checkbox: 'input[type="checkbox"], [role="checkbox"]',
    radio: 'input[type="radio"], [role="radio"]',
    textbox:
      'input:not([type]), input[type="text"], input[type="email"], input[type="password"], input[type="search"], input[type="tel"], input[type="url"], textarea, [role="textbox"]',
    combobox: "select, [role='combobox']",
    tab: '[role="tab"]',
    menuitem: '[role="menuitem"]',
    option: 'option, [role="option"]',
    heading: "h1, h2, h3, h4, h5, h6, [role='heading']",
    img: "img, [role='img']",
    navigation: 'nav, [role="navigation"]',
    complementary: 'aside, [role="complementary"]',
    dialog: 'dialog, [role="dialog"]',
    main: 'main, [role="main"]',
    region: '[role="region"]',
    row: 'tr, [role="row"]',
  };

  const SCOPE_ROLES = new Set([
    "navigation",
    "dialog",
    "region",
    "complementary",
    "banner",
    "main",
    "menu",
    "toolbar",
    "tablist",
  ]);

  /** 仅取元素自身可见文案，避免把侧栏/列表整段文本当成 name */
  function getDirectVisibleText(element) {
    if (!element) return "";
    const bits = [];
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent || "").trim();
        if (t) bits.push(t);
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.tagName;
      if (
        [
          "SPAN",
          "I",
          "B",
          "EM",
          "STRONG",
          "SMALL",
          "SVG",
          "IMG",
          "LABEL",
          "DIV",
        ].includes(tag)
      ) {
        const t = (node.innerText || node.textContent || "").trim();
        if (t && t.length <= 60) bits.push(t);
      }
    }
    const img = element.querySelector(":scope > img[alt], :scope > img[title]");
    if (img) {
      const alt = (img.getAttribute("alt") || img.getAttribute("title") || "").trim();
      if (alt && alt.length <= 60) bits.push(alt);
    }
    const svgTitle = element.querySelector(":scope > svg title");
    if (svgTitle?.textContent?.trim()) {
      bits.push(svgTitle.textContent.trim().slice(0, 60));
    }
    return bits.join(" ").replace(/\s+/g, " ").trim();
  }

  function looksClickableSurface(element) {
    if (!element || element === document.documentElement) return false;
    const tag = element.tagName;
    if (tag === "DIV" || tag === "SPAN" || tag === "LI" || tag === "P") {
      const role = element.getAttribute("role");
      if (role === "button" || role === "link" || role === "menuitem" || role === "tab") {
        return true;
      }
      try {
        if (window.getComputedStyle(element).cursor === "pointer") return true;
      } catch {
        /* ignore */
      }
      if (element.hasAttribute("onclick") || element.getAttribute("tabindex") === "0") {
        return true;
      }
    }
    return false;
  }

  function getAssociatedLabelText(element) {
    if (!element?.id) return "";
    try {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) {
        const t = (label.innerText || label.textContent || "").trim();
        if (isUsableAccessibleText(t)) return t.replace(/\s+/g, " ");
      }
    } catch {
      /* ignore */
    }
    if (element.labels?.length) {
      const t = Array.from(element.labels)
        .map((l) => (l.innerText || l.textContent || "").trim())
        .filter(Boolean)
        .join(" ");
      if (isUsableAccessibleText(t)) return t.replace(/\s+/g, " ");
    }
    return "";
  }

  function getDirectAccessibleName(element) {
    if (!element) return "";

    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel?.trim() && isUsableAccessibleText(ariaLabel)) {
      return ariaLabel.trim().replace(/\s+/g, " ");
    }

    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((n) => (n.innerText || n.textContent || "").trim())
        .filter((t) => isUsableAccessibleText(t));
      if (parts.length) return parts.join(" ").replace(/\s+/g, " ").slice(0, 80);
    }

    const tag = element.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      const labelText =
        getAssociatedLabelText(element) || getLabelTextFromParentLabel(element);
      if (labelText) return labelText.slice(0, 80);
      const placeholder = element.getAttribute("placeholder");
      if (placeholder?.trim() && isUsableAccessibleText(placeholder)) {
        return placeholder.trim().replace(/\s+/g, " ");
      }
      if (tag === "INPUT") {
        const type = (element.type || "").toLowerCase();
        if (type === "submit" || type === "button") {
          const v = (element.value || "").trim();
          if (isUsableAccessibleText(v)) return v;
        }
      }
      return "";
    }

    if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY") {
      const direct = getDirectVisibleText(element);
      if (isUsableAccessibleText(direct)) return direct.slice(0, 80);
      const title = element.getAttribute("title");
      if (title?.trim() && isUsableAccessibleText(title)) {
        return title.trim().replace(/\s+/g, " ");
      }
      return "";
    }

    const title = element.getAttribute("title");
    if (title?.trim() && isUsableAccessibleText(title)) {
      return title.trim().replace(/\s+/g, " ");
    }

    const alt = element.getAttribute("alt");
    if (alt?.trim() && isUsableAccessibleText(alt)) {
      return alt.trim().replace(/\s+/g, " ");
    }

    const role = element.getAttribute("role") || getImplicitRole(element);
    if (role && INTERACTIVE_ROLES.has(role)) {
      const direct = getDirectVisibleText(element);
      if (isUsableAccessibleText(direct)) return direct.slice(0, 80);
    }

    return "";
  }

  function getAccessibleName(element) {
    return getDirectAccessibleName(element);
  }

  function getAriaInfo(element) {
    const role = element.getAttribute("role") || getImplicitRole(element);
    const name = getDirectAccessibleName(element);
    return { role: role || "", name: name || "" };
  }

  function normalizeMatchName(text) {
    return String(text ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function nameMatchesElement(element, targetName, exact) {
    const n = normalizeMatchName(getDirectAccessibleName(element));
    const t = normalizeMatchName(targetName);
    if (!n || !t) return false;
    if (exact) return n === t;
    return n.includes(t) || t.includes(n);
  }

  function countByRoleAndName(role, name, root) {
    const scope = root && root.querySelectorAll ? root : document;
    const sel = ROLE_QUERY[role];
    if (!sel) return 0;
    let nodes;
    try {
      nodes = Array.from(scope.querySelectorAll(sel));
    } catch {
      return 0;
    }
    if (!name) return nodes.length;
    let count = 0;
    for (const el of nodes) {
      if (nameMatchesElement(el, name, true)) count++;
    }
    return count;
  }

  function findNearestScope(element) {
    let node = element?.parentElement;
    let depth = 0;
    while (node && node !== document.documentElement && depth < 12) {
      const role = node.getAttribute("role") || getImplicitRole(node);
      const tag = node.tagName;
      const isLandmark =
        SCOPE_ROLES.has(role) ||
        tag === "NAV" ||
        tag === "ASIDE" ||
        tag === "DIALOG" ||
        tag === "MAIN" ||
        tag === "HEADER" ||
        tag === "FOOTER";
      if (isLandmark) {
        const scopeName = getDirectAccessibleName(node) || node.getAttribute("aria-label") || "";
        if (isUsableAccessibleText(scopeName) || tag === "NAV" || tag === "DIALOG") {
          return {
            element: node,
            role: role || (tag === "NAV" ? "navigation" : tag === "DIALOG" ? "dialog" : "region"),
            name: (scopeName || tag).slice(0, 60),
          };
        }
      }
      node = node.parentElement;
      depth++;
    }
    return null;
  }

  function isInteractiveElement(element) {
    if (!element || element === document.body || element === document.documentElement) {
      return false;
    }
    const tag = element.tagName;
    if (tag === "BUTTON" || tag === "A" || tag === "SELECT" || tag === "TEXTAREA" || tag === "SUMMARY") {
      return true;
    }
    if (tag === "INPUT") {
      const t = (element.type || "text").toLowerCase();
      return !["hidden", "file"].includes(t);
    }
    if (element.isContentEditable) return true;
    const role = element.getAttribute("role");
    if (role && INTERACTIVE_ROLES.has(role)) return true;
    const tabIndex = element.getAttribute("tabindex");
    if (tabIndex != null && tabIndex !== "-1") return true;
    return false;
  }

  /** 解析到真实的 checkbox/radio input（含 label / Ant Design 包裹） */
  function findCheckboxInput(element) {
    if (!element) return null;
    if (element.tagName === "INPUT") {
      const t = (element.type || "").toLowerCase();
      if (t === "checkbox" || t === "radio") return element;
    }
    const role = element.getAttribute("role");
    if (role === "checkbox" || role === "radio") {
      // Prefer a real input nested inside the custom widget for accurate state reading
      const nested = element.querySelector('input[type="checkbox"], input[type="radio"]');
      return nested || element;
    }

    const label = element.closest("label");
    if (label) {
      const inp = label.querySelector(
        'input[type="checkbox"], input[type="radio"]',
      );
      if (inp) return inp;
    }

    const wrapper = element.closest(
      ".ant-checkbox-wrapper, .ant-radio-wrapper, [class*='checkbox'], [class*='radio']",
    );
    if (wrapper) {
      const inp = wrapper.querySelector(
        'input[type="checkbox"], input[type="radio"]',
      );
      if (inp) return inp;
    }
    return null;
  }

  function getLabelTextFromParentLabel(element) {
    const label = element.closest?.("label");
    if (!label) return "";
    const clone = label.cloneNode(true);
    clone
      .querySelectorAll("input, select, textarea, svg, style")
      .forEach((n) => n.remove());
    const t = (clone.innerText || clone.textContent || "").trim().replace(/\s+/g, " ");
    return isUsableAccessibleText(t) ? t.slice(0, 80) : "";
  }

  /** 从点击落点向上找到实际可交互控件（图标/span 包在 button 内、可点击 div 等） */
  function findInteractiveAncestor(element) {
    const cbInput = findCheckboxInput(element);
    if (cbInput) return cbInput;

    let node = element;
    let clickableFallback = null;
    while (node && node !== document.documentElement) {
      if (isInteractiveElement(node)) return node;
      if (!clickableFallback && looksClickableSurface(node)) {
        clickableFallback = node;
      }
      node = node.parentElement;
    }
    return clickableFallback || element;
  }

  function resolveClickTarget(event) {
    const fromPoint = document.elementFromPoint(event.clientX, event.clientY);
    const raw = fromPoint || event.target;
    return findInteractiveAncestor(resolveActionElement(raw));
  }

  /** 链接 target=_blank、form target=_blank 等：点击后会在新标签打开 */
  function clickMayOpenNewTab(element) {
    const a = element?.closest?.("a");
    if (a) {
      const target = String(a.target || "").toLowerCase();
      if (target === "_blank") return true;
      if (/\b_blank\b/i.test(String(a.rel || ""))) return true;
    }
    const form = element?.closest?.("form");
    if (form && String(form.target || "").toLowerCase() === "_blank") {
      return true;
    }
    return false;
  }

  function countSelectorMatches(selector) {
    try {
      return document.querySelectorAll(selector).length;
    } catch {
      return 999;
    }
  }

  function isUniqueSelector(selector) {
    return countSelectorMatches(selector) === 1;
  }

  const WEAK_ROOT_IDS = new Set([
    "__next",
    "__nuxt",
    "__layout",
    "root",
    "app",
    "main",
  ]);

  function isWeakFrameworkId(id) {
    const v = String(id || "").trim();
    if (!v || WEAK_ROOT_IDS.has(v)) return true;
    if (/^__/.test(v)) return true;
    return false;
  }

  function isUsableElementName(name) {
    const n = String(name ?? "").trim();
    if (!n || n.length > 48) return false;
    if (n.split(/\s+/).length > 5) return false;
    return true;
  }

  function isUsableAccessibleText(text) {
    const t = String(text ?? "").trim().replace(/\s+/g, " ");
    if (!t || t.length > 80) return false;
    if (t.split(/\s+/).length > 8) return false;
    return true;
  }

  /** 只锚定实际点击的可交互节点，不向上合并到侧栏/根容器 */
  function findLocatorAnchor(element) {
    return findInteractiveAncestor(resolveActionElement(element));
  }

  function escapeRegExpForName(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function escapeRegExpFlexible(text) {
    const parts = String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "";
    return parts.map((p) => escapeRegExpForName(p)).join("\\s+");
  }

  const GENERIC_SHORT_NAMES = new Set([
    "确定",
    "取消",
    "关闭",
    "更多",
    "编辑",
    "删除",
    "新建",
    "保存",
    "提交",
    "返回",
    "下一步",
    "上一步",
    "展开",
    "收起",
    "搜索",
    "刷新",
    "ok",
    "cancel",
    "save",
    "edit",
    "delete",
    "add",
    "close",
    "back",
    "next",
    "more",
  ]);

  function shouldUseExactName(name) {
    const n = String(name || "").trim();
    if (n.length < 4) return false;
    if (GENERIC_SHORT_NAMES.has(n.toLowerCase()) || GENERIC_SHORT_NAMES.has(n)) {
      return false;
    }
    return n.length >= 6 || n.length >= 4;
  }

  function getPlanSearchName(plan) {
    if (!plan) return "";
    if (plan.strategy === "text") return plan.text || "";
    if (plan.strategy === "placeholder") return plan.placeholder || "";
    if (plan.strategy === "label") return plan.label || "";
    return plan.name || plan.ariaLabel || "";
  }

  function formatRoleNameOptions(name, nameExact) {
    const label = String(name || "").trim();
    if (!label) return "";
    if (nameExact || shouldUseExactName(label)) {
      return `{ name: '${escapeSelectorAttr(label)}', exact: true }`;
    }
    const pattern = escapeRegExpFlexible(label) || escapeRegExpForName(label);
    return `{ name: /${pattern}/ }`;
  }

  function formatPlanSegment(plan) {
    if (!plan?.strategy) return "";
    switch (plan.strategy) {
      case "testid":
        return `getByTestId('${escapeSelectorAttr(plan.testId)}')`;
      case "role": {
        const label = String(plan.name || plan.ariaLabel || "").trim();
        if (!label && !plan.role) return "";
        const opts = formatRoleNameOptions(label, plan.nameExact);
        if (!opts) return `getByRole('${escapeSelectorAttr(plan.role)}')`;
        return `getByRole('${escapeSelectorAttr(plan.role)}', ${opts})`;
      }
      case "structural":
        return `locator('${escapeSelectorAttr(plan.selector || "aside")}')`;
      case "placeholder":
        return `getByPlaceholder('${escapeSelectorAttr(plan.placeholder)}', { exact: true })`;
      case "label":
        return `getByLabel('${escapeSelectorAttr(plan.label)}', { exact: true })`;
      case "id":
        return `locator('#${escapeSelectorAttr(plan.id)}')`;
      case "title": {
        const t = String(plan.title || "").trim();
        if (!t) return "";
        if (plan.nameExact || shouldUseExactName(t)) {
          return `getByTitle('${escapeSelectorAttr(t)}', { exact: true })`;
        }
        const tp = escapeRegExpFlexible(t) || escapeRegExpForName(t);
        return `getByTitle(/${tp}/)`;
      }
      case "text": {
        const t = String(plan.text || "").trim();
        if (!t) return "";
        if (plan.nameExact || shouldUseExactName(t)) {
          return `getByText('${escapeSelectorAttr(t)}', { exact: true })`;
        }
        const pattern = escapeRegExpFlexible(t) || escapeRegExpForName(t);
        return `getByText(/${pattern}/)`;
      }
      default:
        return "";
    }
  }

  function formatStableSelector(plan) {
    if (!plan?.strategy) return "";
    const parts = [];
    if (Array.isArray(plan.ancestors)) {
      for (const anc of plan.ancestors) {
        const seg = formatPlanSegment(anc);
        if (seg) parts.push(seg);
      }
    }
    const target = formatPlanSegment(plan);
    if (target) parts.push(target);
    let s = parts.join(".");
    if (
      plan.matchIndex != null &&
      Number(plan.matchCount) > 1 &&
      Number(plan.matchIndex) >= 0
    ) {
      s += `.nth(${plan.matchIndex})`;
    }
    return s;
  }

  function findElementsForPlanSegment(plan, root) {
    if (!plan?.strategy) return [];
    const scope =
      root && root !== document && root.querySelectorAll ? root : document;
    const isDoc = scope === document;

    switch (plan.strategy) {
      case "role": {
        const sel = ROLE_QUERY[plan.role];
        if (!sel) return [];
        let nodes;
        try {
          nodes = Array.from(
            isDoc ? document.querySelectorAll(sel) : scope.querySelectorAll(sel),
          );
        } catch {
          return [];
        }
        const name = getPlanSearchName(plan);
        if (!name) return nodes;
        return nodes.filter((el) =>
          nameMatchesElement(el, name, !!plan.nameExact),
        );
      }
      case "structural": {
        const q = plan.selector || "aside";
        try {
          return Array.from(
            isDoc ? document.querySelectorAll(q) : scope.querySelectorAll(q),
          );
        } catch {
          return [];
        }
      }
      case "placeholder": {
        const q = "input[placeholder], textarea[placeholder]";
        const nodes = Array.from(
          isDoc ? document.querySelectorAll(q) : scope.querySelectorAll(q),
        );
        const ph = plan.placeholder || "";
        return nodes.filter(
          (el) =>
            normalizeMatchName(el.getAttribute("placeholder")) ===
            normalizeMatchName(ph),
        );
      }
      case "label": {
        const q = "input, textarea, select";
        const nodes = Array.from(
          isDoc ? document.querySelectorAll(q) : scope.querySelectorAll(q),
        );
        return nodes.filter((el) => {
          const lt =
            getAssociatedLabelText(el) || getLabelTextFromParentLabel(el);
          return (
            normalizeMatchName(lt) === normalizeMatchName(plan.label || "")
          );
        });
      }
      case "text": {
        const t = normalizeMatchName(plan.text || "");
        if (!t) return [];
        const nodes = Array.from(
          isDoc
            ? document.querySelectorAll("a, button, [role], label, span, div")
            : scope.querySelectorAll("a, button, [role], label, span, div"),
        );
        return nodes.filter((el) => {
          const direct = normalizeMatchName(getDirectVisibleText(el));
          return plan.nameExact
            ? direct === t
            : direct.includes(t) || t.includes(direct);
        });
      }
      case "id": {
        try {
          const el = isDoc
            ? document.getElementById(plan.id)
            : scope.querySelector(`#${CSS.escape(plan.id)}`);
          return el ? [el] : [];
        } catch {
          const el = isDoc
            ? document.getElementById(plan.id)
            : scope.querySelector(`#${plan.id}`);
          return el ? [el] : [];
        }
      }
      default:
        return [];
    }
  }

  function findElementsMatchingPlan(plan, restrictRoot) {
    let roots = [restrictRoot || document];
    if (Array.isArray(plan.ancestors) && plan.ancestors.length) {
      for (const anc of plan.ancestors) {
        const next = [];
        for (const r of roots) {
          const found = findElementsForPlanSegment(
            anc,
            r === document ? null : r,
          );
          for (const el of found) {
            if (!next.includes(el)) next.push(el);
          }
        }
        roots = next.length ? next : [];
        if (!roots.length) return [];
      }
    }
    const out = [];
    for (const r of roots) {
      const hits = findElementsForPlanSegment(plan, r === document ? null : r);
      for (const el of hits) {
        if (!out.includes(el)) out.push(el);
      }
    }
    return out;
  }

  function findMatchIndexInList(anchor, matches) {
    if (!anchor || !matches?.length) return -1;
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (m === anchor) return i;
      try {
        if (m.contains(anchor) || anchor.contains(m)) return i;
      } catch {
        /* ignore */
      }
    }
    return -1;
  }

  function buildScopePlanFromNearest(nearest) {
    if (!nearest) return null;
    const name = String(nearest.name || "").trim();
    return {
      strategy: "role",
      role: nearest.role || "region",
      name,
      nameExact: shouldUseExactName(name),
    };
  }

  function findRowScope(element) {
    const row = element.closest?.("tr, [role='row']");
    if (!row) return null;
    const name = (
      getDirectAccessibleName(row) ||
      (row.innerText || row.textContent || "")
    )
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);
    if (!name || name.length < 3) return null;
    return {
      strategy: "role",
      role: "row",
      name,
      nameExact: shouldUseExactName(name),
    };
  }

  function findStructuralScope(element) {
    const node = element.closest?.(
      "aside, nav.ant-layout-sider, .ant-layout-sider, .ant-drawer, nav",
    );
    if (!node || node === document.body) return null;
    const tag = node.tagName;
    if (tag === "ASIDE") {
      return { strategy: "structural", selector: "aside" };
    }
    if (tag === "NAV") {
      return { strategy: "structural", selector: "nav" };
    }
    if (node.classList?.contains("ant-layout-sider")) {
      return { strategy: "structural", selector: ".ant-layout-sider" };
    }
    return null;
  }

  function resolveScopeRoot(anchor, scopePlan, nearest) {
    if (nearest?.element && scopePlan?.strategy === "role") {
      const nr = nearest.role || "";
      const sr = scopePlan.role || "";
      if (nr === sr || (nearest.element.contains(anchor) && sr === "region")) {
        return nearest.element;
      }
    }
    if (scopePlan?.strategy === "structural" && scopePlan.selector) {
      const node = anchor.closest?.(scopePlan.selector);
      if (node) return node;
    }
    if (scopePlan?.strategy === "role" && scopePlan.role === "row") {
      return anchor.closest?.("tr, [role='row']") || null;
    }
    const matches = findElementsForPlanSegment(scopePlan, null);
    for (const el of matches) {
      if (el.contains(anchor)) return el;
    }
    return matches[0] || null;
  }

  function refineLocatorPlan(anchor, basePlan) {
    if (!basePlan || !anchor) return basePlan;

    let plan = { ...basePlan };
    const searchName = getPlanSearchName(plan);
    if (searchName && plan.strategy === "role") {
      plan.nameExact = shouldUseExactName(searchName);
    } else if (searchName && (plan.strategy === "text" || plan.strategy === "title")) {
      plan.nameExact = shouldUseExactName(searchName);
    }

    if (plan.strategy === "testid" || plan.strategy === "id") {
      plan.matchCount = 1;
      return plan;
    }

    let matches = findElementsMatchingPlan(plan, null);
    let matchCount = matches.length;

    if (matchCount > 1 && !plan.nameExact && searchName) {
      const exactTrial = { ...plan, nameExact: true };
      const exactMatches = findElementsMatchingPlan(exactTrial, null);
      if (exactMatches.length > 0 && exactMatches.length <= matchCount) {
        plan = exactTrial;
        matches = exactMatches;
        matchCount = exactMatches.length;
      }
    }

    if (matchCount === 1) {
      plan.matchCount = 1;
      return plan;
    }

    const nearest = findNearestScope(anchor);
    const scopeCandidates = [
      buildScopePlanFromNearest(nearest),
      findRowScope(anchor),
      findStructuralScope(anchor),
    ].filter(Boolean);

    for (const scopePlan of scopeCandidates) {
      const scopeRoot = resolveScopeRoot(anchor, scopePlan, nearest);
      if (!scopeRoot) continue;

      const trial = {
        ...plan,
        ancestors: [scopePlan],
        nameExact: plan.nameExact || shouldUseExactName(searchName),
      };
      const scoped = findElementsForPlanSegment(trial, scopeRoot);
      if (scoped.length === 1) {
        trial.matchCount = 1;
        trial.locatorNote = "scoped";
        return trial;
      }
      if (scoped.length > 1 && scoped.length < matchCount) {
        plan = trial;
        matches = scoped;
        matchCount = scoped.length;
        if (matchCount === 1) {
          plan.matchCount = 1;
          return plan;
        }
      }
    }

    plan.matchCount = matchCount;
    if (matchCount > 1) {
      const matchIndex = findMatchIndexInList(anchor, matches);
      if (matchIndex >= 0) {
        plan.matchIndex = matchIndex;
        plan.locatorNote = `nth(${matchIndex}) of ${matchCount}`;
      }
    }
    return plan;
  }

  function formatSelectorFromPlan(plan) {
    return formatStableSelector(plan);
  }

  function normalizeActionType(type) {
    const map = {
      click: "CLICK",
      type: "FILL",
      fill: "FILL",
      navigate: "NAVIGATE",
      scroll: "SCROLL",
      hover: "HOVER",
      select: "SELECT",
      check: "CHECK",
      uncheck: "UNCHECK",
      wait: "WAIT",
      assert: "ASSERT",
      sleep: "SLEEP",
      label: "LABEL",
    };
    const key = String(type || "").toLowerCase();
    return map[key] || String(type || "CLICK").toUpperCase();
  }

  function buildLocatorPlan(element) {
    if (!element?.tagName) return null;

    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute("role") || getImplicitRole(element);
    const name = getDirectAccessibleName(element);
    const ariaLabel = element.getAttribute("aria-label");

    for (const attr of DATA_TEST_ATTRS) {
      if (!element.hasAttribute(attr)) continue;
      const testId = element.getAttribute(attr);
      const bare = `[${attr}="${escapeSelectorAttr(testId)}"]`;
      if (isUniqueSelector(bare)) {
        return { strategy: "testid", testAttr: attr, testId, role, name, tag };
      }
      if (isUniqueSelector(`${tag}${bare}`)) {
        return { strategy: "testid", testAttr: attr, testId, role, name, tag };
      }
    }

    const directTextEarly = getDirectVisibleText(element);
    if (
      (tag === "span" || tag === "div") &&
      isUsableAccessibleText(directTextEarly) &&
      (element.closest?.("button, a, [role='button']") ||
        getComputedStyle(element).cursor === "pointer")
    ) {
      return {
        strategy: "text",
        text: directTextEarly,
        nameExact: shouldUseExactName(directTextEarly),
        tag,
      };
    }

    if (role && isUsableAccessibleText(name)) {
      return { strategy: "role", role, name, tag };
    }

    const placeholder = element.getAttribute("placeholder");
    if (
      placeholder?.trim() &&
      isUsableAccessibleText(placeholder) &&
      (tag === "input" || tag === "textarea")
    ) {
      return {
        strategy: "placeholder",
        placeholder: placeholder.trim(),
        role,
        name,
        tag,
      };
    }

    const labelText =
      getAssociatedLabelText(element) || getLabelTextFromParentLabel(element);
    if (labelText && (tag === "input" || tag === "textarea" || tag === "select")) {
      const inputType = (element.type || "").toLowerCase();
      if (
        inputType === "checkbox" ||
        inputType === "radio" ||
        role === "checkbox" ||
        role === "radio"
      ) {
        return {
          strategy: "role",
          role: role || inputType || "checkbox",
          name: labelText,
          nameExact: shouldUseExactName(labelText),
          tag,
        };
      }
      return { strategy: "label", label: labelText, role, tag };
    }

    if (
      element.id &&
      !/\s/.test(element.id) &&
      !isWeakFrameworkId(element.id)
    ) {
      try {
        const idSel = `#${CSS.escape(element.id)}`;
        if (isUniqueSelector(idSel)) {
          return { strategy: "id", id: element.id, role, name, tag };
        }
      } catch {
        const idSel = `#${element.id}`;
        if (isUniqueSelector(idSel)) {
          return { strategy: "id", id: element.id, role, name, tag };
        }
      }
    }

    if (ariaLabel?.trim() && isUsableAccessibleText(ariaLabel) && role) {
      return { strategy: "role", role, name: ariaLabel.trim(), ariaLabel: ariaLabel.trim(), tag };
    }

    if (role && tag === "a" && isUsableAccessibleText(name)) {
      return { strategy: "role", role: "link", name, tag };
    }

    if (role && (tag === "button" || tag === "summary") && isUsableAccessibleText(name)) {
      return { strategy: "role", role: "button", name, tag };
    }

    if (role && INTERACTIVE_ROLES.has(role) && isUsableAccessibleText(name)) {
      return { strategy: "role", role, name, tag };
    }

    const title = element.getAttribute("title");
    if (title?.trim() && isUsableAccessibleText(title)) {
      return { strategy: "title", title: title.trim(), role, tag };
    }

    const directText = getDirectVisibleText(element);
    if (isUsableAccessibleText(directText)) {
      const implicitRole = role || (tag === "a" ? "link" : "");
      if (implicitRole && INTERACTIVE_ROLES.has(implicitRole)) {
        return { strategy: "role", role: implicitRole, name: directText, tag };
      }
      return { strategy: "text", text: directText, tag };
    }

    return null;
  }

  chrome.runtime.onMessage.addListener(
    function (message, sender, sendResponse) {
      console.log(
        "Content script received message:",
        message,
        "on page:",
        window.location.href,
      );

      if (message.command === "startRecording") {
        isRecording = true;
        addEventListeners();
        console.log("Recording started on", window.location.href);
        sendResponse({
          status: "recording_started",
          url: window.location.href,
        });
      } else if (message.command === "stopRecording") {
        isRecording = false;
        removeEventListeners();
        hideRecordingIndicator();
        console.log("Recording stopped");
        sendResponse({ status: "recording_stopped" });
      } else if (message?.type === "uiauto-recorder") {
        if (message.action === "start") {
          isRecording = true;
          addEventListeners();
          showRecordingIndicator();
        } else if (message.action === "stop") {
          isRecording = false;
          removeEventListeners();
          hideRecordingIndicator();
        } else if (message.action === "pause") {
          /* paused state handled in background */
        } else if (message.action === "resume") {
          /* resumed */
        }
        sendResponse({ ok: true });
      } else if (message.command === "getStorage") {
        try {
          const storage = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            storage[key] = localStorage.getItem(key);
          }
          sendResponse({ success: true, storage: storage });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
        return true;
      } else if (message.command === "setStorage") {
        try {
          Object.keys(message.storage).forEach((key) => {
            localStorage.setItem(key, message.storage[key]);
          });
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
        return true;
      } else if (message.command === "startAssertPicker") {
        startAssertPicker();
        sendResponse({ status: "assert_picker_started" });
      } else if (message.command === "stopAssertPicker") {
        stopAssertPicker();
        sendResponse({ status: "assert_picker_stopped" });
      }
    },
  );

  let _listenersAttached = false;

  function addEventListeners() {
    if (_listenersAttached) return;
    _listenersAttached = true;
    console.log("Adding event listeners on", window.location.href);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("change", handleChange, true);
  }

  function removeEventListeners() {
    if (!_listenersAttached) return;
    _listenersAttached = false;
    console.log("Removing event listeners");
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("input", handleInput, true);
    document.removeEventListener("change", handleChange, true);
  }

  function getElementTextForAssert(element) {
    if (!element) return "";
    const tag = element.tagName;
    let text = "";
    if (tag === "INPUT" || tag === "TEXTAREA") {
      text =
        element.placeholder ||
        element.value ||
        element.getAttribute("aria-label") ||
        "";
    } else {
      text = (element.innerText || element.textContent || "").trim();
    }
    return text.replace(/\s+/g, " ").substring(0, 200);
  }

  function buildAssertTarget(element) {
    const anchor = findLocatorAnchor(element);
    const selector = generateSelector(anchor);
    const ariaInfo = getAriaInfo(anchor);
    const text = getElementTextForAssert(element);

    const parts = [];
    if (text) parts.push(`文本: ${text}`);
    if (selector) parts.push(`定位: ${selector}`);
    if (ariaInfo.role) {
      parts.push(
        `role: ${ariaInfo.role}${ariaInfo.name ? ` / ${ariaInfo.name}` : ""}`,
      );
    }

    return {
      selector: selector || "",
      text,
      ariaRole: ariaInfo.role || "",
      ariaName: ariaInfo.name || "",
      tagName: element.tagName || "",
      locatorAttrs: collectLocatorAttrs(anchor),
      summary: parts.join(" · ") || "(无可用信息)",
    };
  }

  function ensurePickHighlightBox() {
    if (pickHighlightBox) return pickHighlightBox;
    pickHighlightBox = document.createElement("div");
    pickHighlightBox.id = "playwright-recorder-pick-highlight";
    Object.assign(pickHighlightBox.style, {
      position: "fixed",
      zIndex: "2147483646",
      pointerEvents: "none",
      border: "2px solid #1f6feb",
      background: "rgba(31, 111, 235, 0.12)",
      borderRadius: "3px",
      boxSizing: "border-box",
      display: "none",
    });
    document.body.appendChild(pickHighlightBox);
    return pickHighlightBox;
  }

  function showPickBanner() {
    if (pickBanner) pickBanner.remove();
    pickBanner = document.createElement("div");
    pickBanner.id = "playwright-recorder-pick-banner";
    pickBanner.textContent = "点击页面元素添加断言 · Esc 取消";
    Object.assign(pickBanner.style, {
      position: "fixed",
      top: "12px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
      background: "#1f6feb",
      color: "#fff",
      padding: "8px 16px",
      borderRadius: "8px",
      fontSize: "13px",
      fontFamily: "system-ui, sans-serif",
      boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
      pointerEvents: "none",
    });
    document.body.appendChild(pickBanner);
  }

  function hidePickBanner() {
    if (pickBanner) {
      pickBanner.remove();
      pickBanner = null;
    }
  }

  function updatePickHighlight(element) {
    const box = ensurePickHighlightBox();
    if (
      !element ||
      element === document.documentElement ||
      element === document.body
    ) {
      box.style.display = "none";
      return;
    }
    const rect = element.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${Math.max(rect.width, 1)}px`;
    box.style.height = `${Math.max(rect.height, 1)}px`;
  }

  function onAssertPickMouseMove(event) {
    if (!isAssertPicking) return;
    let el = document.elementFromPoint(event.clientX, event.clientY);
    if (
      !el ||
      el.id === "playwright-recorder-pick-highlight" ||
      el.id === "playwright-recorder-pick-banner"
    ) {
      return;
    }
    el = findInteractiveAncestor(resolveActionElement(el));
    updatePickHighlight(el);
  }

  function onAssertPickClick(event) {
    if (!isAssertPicking) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
      let el = document.elementFromPoint(event.clientX, event.clientY) || event.target;
      if (
        el.id === "playwright-recorder-pick-highlight" ||
        el.id === "playwright-recorder-pick-banner"
      ) {
        return;
      }
      el = findInteractiveAncestor(resolveActionElement(el));

      const target = buildAssertTarget(el);
      if (!target.selector && !target.ariaRole) {
        return;
      }

      sendMessageSafely({ type: "assertTargetPicked", target });
    } finally {
      // 必须退出点选模式，否则会一直拦截页面点击导致录制中断
      stopAssertPicker();
    }
  }

  function onAssertPickKeyDown(event) {
    if (!isAssertPicking || event.key !== "Escape") return;
    event.preventDefault();
    stopAssertPicker();
    sendMessageSafely({ type: "assertPickCancelled" });
  }

  function startAssertPicker() {
    stopAssertPicker();
    isAssertPicking = true;
    showPickBanner();
    document.addEventListener("mousemove", onAssertPickMouseMove, true);
    document.addEventListener("click", onAssertPickClick, true);
    document.addEventListener("keydown", onAssertPickKeyDown, true);
    document.body.style.cursor = "crosshair";
  }

  function stopAssertPicker() {
    isAssertPicking = false;
    document.removeEventListener("mousemove", onAssertPickMouseMove, true);
    document.removeEventListener("click", onAssertPickClick, true);
    document.removeEventListener("keydown", onAssertPickKeyDown, true);
    if (document.body) document.body.style.cursor = "";
    hidePickBanner();
    if (pickHighlightBox) pickHighlightBox.style.display = "none";
  }

  /** 将 label 点击解析到关联的表单控件 */
  function resolveActionElement(el) {
    if (!el) return el;
    if (el.tagName === "LABEL") {
      const id = el.htmlFor;
      if (id) {
        const linked = document.getElementById(id);
        if (linked) return linked;
      }
      const nested = el.querySelector("input, textarea, select");
      if (nested) return nested;
    }
    return el;
  }

  /** 是否应由 input/change 录制，而非 click */
  function isTypableElement(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      if (["button", "submit", "reset", "image", "file", "hidden"].includes(t)) {
        return false;
      }
      return true;
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function readInputValue(el) {
    if (!el) return undefined;
    if (el.value !== undefined && el.value !== null) return el.value;
    if (el.isContentEditable) {
      return (el.innerText || el.textContent || "").trim();
    }
    return undefined;
  }

  function isElementChecked(el) {
    if (!el) return false;
    const inputType = (el.type || "").toLowerCase();
    if (el.tagName === "INPUT" && (inputType === "checkbox" || inputType === "radio")) {
      return !!el.checked;
    }
    if (el.getAttribute("aria-checked") === "true") return true;
    if (
      el.classList?.contains("ant-checkbox-checked") ||
      el.classList?.contains("ant-radio-checked")
    ) {
      return true;
    }
    const nested = el.querySelector?.(
      'input[type="checkbox"], input[type="radio"]',
    );
    if (nested) return !!nested.checked;
    return false;
  }

  function recordCheckboxToggle(element) {
    const input = findCheckboxInput(element) || element;
    const inputType = (input.type || "").toLowerCase();
    const role = input.getAttribute?.("role") || getImplicitRole(input);
    const isCheckbox = inputType === "checkbox" || role === "checkbox";
    const isRadio = inputType === "radio" || role === "radio";
    if (!isCheckbox && !isRadio) return false;

    const checked = isElementChecked(input);

    if (isRadio && !checked) return false;

    const actionType = checked ? "check" : "uncheck";
    if (sendRecordedAction({ type: actionType }, input)) {
      console.log(`${actionType} recorded (checkbox/radio click)`);
      return true;
    }
    console.log("Could not generate selector for checkbox/radio");
    return false;
  }

  function handleClick(event) {
    if (isAssertPicking) return;

    if (!isRecording || !isExtensionConnected) return;

    const el = resolveClickTarget(event);
    const tag = el?.tagName;

    // Skip non-interactive shell elements (FORM 整块点击会生成 locator('form').filter(hasText) 等脆弱步骤)
    if (
      !tag ||
      tag === "HTML" ||
      tag === "BODY" ||
      tag === "FORM" ||
      tag === "FIELDSET" ||
      el?.id === "playwright-recorder-indicator"
    ) {
      return;
    }

    const cbTarget = findCheckboxInput(el) || findCheckboxInput(event.target);
    if (cbTarget || (el?.type || "").toLowerCase() === "checkbox" || (el?.type || "").toLowerCase() === "radio") {
      // 勾选状态由 change 事件录制（状态更准确）；此处仅阻止误录为 click
      return;
    }

    // Skip text inputs; checkbox/radio handled above
    if (isTypableElement(el)) {
      console.log("Click on typable element suppressed, handled by input/change");
      return;
    }

    const anchor = findLocatorAnchor(el);

    if (
      sendRecordedAction(
        { type: "click", opensNewTab: clickMayOpenNewTab(anchor) },
        anchor,
      )
    ) {
      console.log("Click recorded");
    } else {
      console.log(
        "Click skipped — no stable locator (add data-testid / aria-label / visible text)",
        anchor,
      );
    }
  }

  function handleInput(event) {
    if (isAssertPicking) return;
    if (!isRecording || !isExtensionConnected) return;

    const raw = resolveActionElement(event.target);
    let inputEl = findLocatorAnchor(raw);
    if (
      !inputEl ||
      (inputEl.tagName !== "INPUT" &&
        inputEl.tagName !== "TEXTAREA" &&
        !inputEl.isContentEditable)
    ) {
      const nested = raw?.closest?.(
        ".ant-input-affix-wrapper, .ant-input, [class*='input']",
      );
      const inner = nested?.querySelector?.("input, textarea");
      if (inner) inputEl = findLocatorAnchor(inner);
    }
    console.log("Input event detected:", inputEl);

    if (!inputEl) return;

    const inputTag = inputEl?.tagName;
    const inputType = (inputEl?.type || "").toLowerCase();
    if (
      inputTag === "SELECT" ||
      inputType === "checkbox" ||
      inputType === "radio"
    ) {
      return;
    }

    if (inputEl._inputTimer) {
      clearTimeout(inputEl._inputTimer);
    }

    inputEl._inputTimer = setTimeout(() => {
      // Re-check state; recording may have been stopped during the debounce window
      if (!isRecording || !isExtensionConnected) return;
      console.log("Input event finalized on:", inputEl);
      const value = readInputValue(inputEl);
      if (value === undefined) return;
      if (sendRecordedAction({ type: "fill", value }, inputEl)) {
        console.log("Input recorded, value:", value);
      } else {
        console.log("Could not generate selector for input element");
      }
    }, 500);
  }

  function handleChange(event) {
    if (isAssertPicking) return;
    if (!isRecording || !isExtensionConnected) return;

    const raw = resolveActionElement(event.target);
    const cbInput = findCheckboxInput(raw);
    if (cbInput) {
      recordCheckboxToggle(cbInput);
      return;
    }
    const el = findLocatorAnchor(raw);
    console.log("Change event detected:", el);

    if (!el) return;

    const inputType = (el.type || "").toLowerCase();
    if (inputType === "checkbox" || inputType === "radio") {
      return;
    } else if (el.tagName === "SELECT") {
      const value = el.value;
      if (sendRecordedAction({ type: "select", value }, el)) {
        console.log("Select change recorded:", value);
      } else {
        console.log("Could not generate selector for select element");
      }
    }
  }

  function escapeSelectorAttr(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }

  /** 为 Playwright frameLocator 生成 iframe 选择器（优先 title / name） */
  function buildFrameLocatorSelector(frameEl) {
    if (!frameEl?.tagName) return null;
    const title = frameEl.getAttribute("title")?.trim();
    if (title && title.length <= 120) {
      return `iframe[title="${escapeSelectorAttr(title)}"]`;
    }
    const name = frameEl.getAttribute("name")?.trim();
    if (name && name.length <= 120) {
      return `iframe[name="${escapeSelectorAttr(name)}"]`;
    }
    if (
      frameEl.id &&
      !/\s/.test(frameEl.id) &&
      !isWeakFrameworkId(frameEl.id)
    ) {
      try {
        const idSel = `iframe#${CSS.escape(frameEl.id)}`;
        if (isUniqueSelector(idSel)) return idSel;
      } catch {
        if (isUniqueSelector(`iframe#${frameEl.id}`)) return `iframe#${frameEl.id}`;
      }
    }
    const src = frameEl.getAttribute("src")?.trim();
    if (src) {
      try {
        const u = new URL(src, location.href);
        const needle = (u.pathname || u.hostname || "").slice(-48);
        if (needle.length >= 4) {
          return `iframe[src*="${escapeSelectorAttr(needle)}"]`;
        }
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  /** 从当前 frame 向上收集 iframe 链（外层在前） */
  function collectFrameChainForWindow() {
    if (window === window.top) return null;
    const chain = [];
    let w = window;
    while (w !== w.top) {
      let frameEl = null;
      try {
        frameEl = w.frameElement || null;
      } catch {
        frameEl = null;
      }
      if (!frameEl) {
        try {
          const frames = w.parent.document.querySelectorAll("iframe, frame");
          for (const f of frames) {
            if (f.contentWindow === w) {
              frameEl = f;
              break;
            }
          }
        } catch {
          break;
        }
      }
      const sel = buildFrameLocatorSelector(frameEl);
      if (!sel) break;
      chain.unshift(sel);
      w = w.parent;
    }
    return chain.length ? chain : null;
  }

  function getStableClassList(element) {
    if (!element?.className || typeof element.className !== "string") return [];
    return element.className
      .trim()
      .split(/\s+/)
      .filter(
        (cls) =>
          cls &&
          !cls.match(/^[a-z0-9]{5,}$/i) &&
          !cls.includes("__") &&
          !cls.includes("--") &&
          cls.length > 2,
      )
      .slice(0, 3);
  }

  /** 多属性定位元数据，供脚本生成组合 locator */
  function collectLocatorAttrs(element) {
    if (!element?.tagName) return null;
    const tag = element.tagName.toLowerCase();
    const attrs = { tag };

    for (const attr of DATA_TEST_ATTRS) {
      if (element.hasAttribute(attr)) {
        attrs.testAttr = attr;
        attrs.testId = element.getAttribute(attr);
        break;
      }
    }

    if (element.id && !/\s/.test(element.id) && !isWeakFrameworkId(element.id)) {
      attrs.id = element.id;
    }
    const elName = element.getAttribute("name");
    if (isUsableElementName(elName)) attrs.elementName = elName;
    const role = element.getAttribute("role") || getImplicitRole(element);
    if (role) attrs.role = role;
    const ariaName = getDirectAccessibleName(element);
    if (ariaName) attrs.ariaName = ariaName.slice(0, 80);
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel?.trim()) attrs.ariaLabel = ariaLabel.trim().slice(0, 120);
    if (element.type) attrs.inputType = (element.type || "").toLowerCase();
    if (tag === "a" && element.href) {
      try {
        attrs.href = new URL(element.href, location.href).pathname;
      } catch {
        attrs.href = element.getAttribute("href") || "";
      }
    }
    const classes = getStableClassList(element);
    if (classes.length) attrs.classes = classes;
    if (element.placeholder) attrs.placeholder = element.placeholder.trim();
    if (element.getAttribute("title")) attrs.title = element.getAttribute("title").trim();
    return attrs;
  }

  function resolveLocatorTargetForAction(action, element) {
    const type = normalizeActionType(action?.type);
    if (type === "CHECK" || type === "UNCHECK") {
      const input = findCheckboxInput(element) || element;
      const wrapper = input.closest?.(
        "label, .ant-checkbox-wrapper, .ant-radio-wrapper, [role='checkbox'], [role='radio']",
      );
      return wrapper || input;
    }
    if (type === "FILL") {
      const anchor = findLocatorAnchor(resolveActionElement(element));
      if (
        anchor?.tagName === "INPUT" ||
        anchor?.tagName === "TEXTAREA" ||
        anchor?.isContentEditable
      ) {
        return anchor;
      }
      const nested = element?.querySelector?.("input, textarea");
      if (nested) return findLocatorAnchor(nested);
    }
    return findLocatorAnchor(element);
  }

  function enrichRecordedAction(action, element) {
    const anchor = resolveLocatorTargetForAction(action, element);
    const basePlan = buildLocatorPlan(anchor);
    const plan = basePlan ? refineLocatorPlan(anchor, basePlan) : null;
    const ariaInfo = getAriaInfo(anchor);
    action.type = normalizeActionType(action.type);
    action.locatorPlan = plan || undefined;
    action.role = plan?.role || ariaInfo.role || "";
    action.ariaRole = action.role;
    action.ariaName = plan?.name || plan?.text || ariaInfo.name || "";
    action.stableSelector = plan ? formatStableSelector(plan) : "";
    action.selector = action.stableSelector;
    if (plan?.matchCount != null) action.matchCount = plan.matchCount;
    if (plan?.matchIndex != null) action.matchIndex = plan.matchIndex;
    if (plan?.locatorNote) action.locatorNote = plan.locatorNote;
    action.locatorAttrs = collectLocatorAttrs(anchor) || {};
    if (plan?.role) action.locatorAttrs.role = plan.role;
    if (plan?.name) action.locatorAttrs.ariaName = plan.name;
    if (window !== window.top) {
      action.frameUrl = location.href;
      const frameChain = collectFrameChainForWindow();
      if (frameChain?.length) {
        action.frameChain = frameChain;
      } else {
        action.inIframe = true;
      }
    }
    return action;
  }

  function applyLocatorFallback(enriched) {
    if (enriched.stableSelector) return true;
    const la = enriched.locatorAttrs || {};
    const plan = enriched.locatorPlan;

    if (la.testId) {
      enriched.stableSelector = `getByTestId('${escapeSelectorAttr(la.testId)}')`;
      enriched.selector = enriched.stableSelector;
      return true;
    }
    if (la.id) {
      enriched.stableSelector = `locator('#${escapeSelectorAttr(la.id)}')`;
      enriched.selector = enriched.stableSelector;
      return true;
    }
    if (plan?.strategy === "label" && plan.label) {
      enriched.stableSelector = `getByLabel('${escapeSelectorAttr(plan.label)}', { exact: true })`;
      enriched.selector = enriched.stableSelector;
      return true;
    }
    if (plan?.strategy === "placeholder" && plan.placeholder) {
      enriched.stableSelector = `getByPlaceholder('${escapeSelectorAttr(plan.placeholder)}', { exact: true })`;
      enriched.selector = enriched.stableSelector;
      return true;
    }
    if (la.placeholder) {
      enriched.stableSelector = `getByPlaceholder('${escapeSelectorAttr(la.placeholder)}', { exact: true })`;
      enriched.selector = enriched.stableSelector;
      return true;
    }
    if (la.elementName) {
      enriched.stableSelector = `locator('[name="${escapeSelectorAttr(la.elementName)}"]')`;
      enriched.selector = enriched.stableSelector;
      return true;
    }
    const role = la.role || plan?.role || enriched.role || enriched.ariaRole;
    const name =
      la.ariaName ||
      la.ariaLabel ||
      plan?.name ||
      enriched.ariaName ||
      "";
    if (role) {
      const opts = formatRoleNameOptions(name, plan?.nameExact);
      enriched.stableSelector = opts
        ? `getByRole('${escapeSelectorAttr(role)}', ${opts})`
        : `getByRole('${escapeSelectorAttr(role)}')`;
      enriched.selector = enriched.stableSelector;
      return true;
    }
    return false;
  }

  function sendRecordedAction(action, element) {
    const enriched = enrichRecordedAction(action, element);
    if (!applyLocatorFallback(enriched)) return false;
    sendMessageSafely({ type: "action", action: enriched });
    return true;
  }

  function generateSelector(element) {
    if (
      !element ||
      element === document ||
      element === document.documentElement
    ) {
      return null;
    }
    const plan = buildLocatorPlan(element);
    return plan ? formatSelectorFromPlan(plan) : null;
  }

  function showRecordingIndicator() {
    const existingIndicator = document.getElementById(
      "playwright-recorder-indicator",
    );
    if (existingIndicator) {
      existingIndicator.remove();
    }

    const indicator = document.createElement("div");
    indicator.id = "playwright-recorder-indicator";
    indicator.style.position = "fixed";
    indicator.style.top = "5px";
    indicator.style.right = "5px";
    indicator.style.width = "15px";
    indicator.style.height = "15px";
    indicator.style.borderRadius = "50%";
    indicator.style.backgroundColor = "red";
    indicator.style.zIndex = "9999999";
    indicator.style.animation = "playwright-recorder-pulse 1.5s infinite";

    const PULSE_STYLE_ID = "playwright-recorder-pulse-style";
    if (!document.getElementById(PULSE_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = PULSE_STYLE_ID;
      style.textContent = `
        @keyframes playwright-recorder-pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(indicator);
  }

  function hideRecordingIndicator() {
    const indicator = document.getElementById("playwright-recorder-indicator");
    if (indicator) {
      indicator.remove();
    }
  }

  chrome.runtime.sendMessage({ type: "uiauto-status-request" }, function (response) {
    if (response && response.recording) {
      isRecording = true;
      addEventListeners();
      showRecordingIndicator();
      console.log("Recording was already active, listeners added");
    }
  });

  window.addEventListener("error", function (event) {
    if (
      event.error &&
      event.error.message &&
      event.error.message.includes("Extension context invalidated")
    ) {
      console.log(
        "Extension context was invalidated. This is normal during development.",
      );
      isExtensionConnected = false;
      hideRecordingIndicator();
      removeEventListeners();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && isRecording) {
      console.log("Page became visible, ensuring recording is active");
      showRecordingIndicator();
    }
  });

  console.log(
    "Playwright Recorder: Content script initialization complete on",
    window.location.href,
  );
})();
