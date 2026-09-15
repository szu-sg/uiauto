import { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';

const UserContext = createContext(null);

export function UserProvider({ user: initialUser, onUserChange, children }) {
  const [user, setUser] = useState(initialUser);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  const updateUser = useCallback((next) => {
    setUser(next);
    onUserChange?.(next);
  }, [onUserChange]);

  const value = useMemo(() => ({
    user,
    setUser: updateUser,
  }), [user, updateUser]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  return ctx?.user ?? null;
}

export function useUserActions() {
  const ctx = useContext(UserContext);
  return { setUser: ctx?.setUser };
}
