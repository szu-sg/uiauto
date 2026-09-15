import WorkbenchLayout from '../components/layout/WorkbenchLayout';

export default function NoTeamPage() {
  return (
    <WorkbenchLayout className="wb-page no-team-page">
      <div className="glass-card no-team-card">
        <h1 className="no-team-card__title">尚未加入项目空间</h1>
        <p className="no-team-card__desc">
          平台采用管理员开通模式：请联系 UIAuto 平台超级管理员为您创建空间并授予权限。
          您需要先完成一次 WPS 登录，管理员才能将您加入空间。
        </p>
      </div>
    </WorkbenchLayout>
  );
}
