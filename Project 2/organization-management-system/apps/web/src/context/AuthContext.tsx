import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient, setAccessToken, setOnUnauthenticated } from '../api/client.js';
import { User, CurrentOrganization, AccessibleOrganization } from '../types/index.js';
import { RegisterInput, LoginInput } from '@orgsphere/shared';

interface AuthContextValue {
  user: User | null;
  currentOrganization: CurrentOrganization | null;
  accessibleOrganizations: AccessibleOrganization[];
  isLoading: boolean;
  tenantGeneration: number;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (targetOrgId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearTenantData: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [currentOrganization, setCurrentOrganization] = useState<CurrentOrganization | null>(null);
  const [accessibleOrganizations, setAccessibleOrganizations] = useState<AccessibleOrganization[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [tenantGeneration, setTenantGeneration] = useState<number>(1);

  const clearTenantData = useCallback(() => {
    setTenantGeneration((prev) => prev + 1);
  }, []);

  const fetchMe = useCallback(async () => {
    try {
      const res = await apiClient.get<{
        user: User;
        currentOrganization: CurrentOrganization | null;
        accessibleOrganizations: AccessibleOrganization[];
      }>('/auth/me');

      setUser(res.data.user);
      setCurrentOrganization(res.data.currentOrganization);
      setAccessibleOrganizations(res.data.accessibleOrganizations || []);
    } catch {
      setUser(null);
      setCurrentOrganization(null);
      setAccessibleOrganizations([]);
      setAccessToken(null);
    }
  }, []);

  // Initial session restoration via HttpOnly refresh cookie
  useEffect(() => {
    setOnUnauthenticated(() => {
      setAccessToken(null);
      setUser(null);
      setCurrentOrganization(null);
      setAccessibleOrganizations([]);
    });

    const initAuth = async () => {
      try {
        const refreshRes = await apiClient.post<{ accessToken: string }>('/auth/refresh', undefined, {
          skipAuthRefresh: true,
        });

        if (refreshRes.data.accessToken) {
          setAccessToken(refreshRes.data.accessToken);
          await fetchMe();
        }
      } catch {
        // No active session or cookie missing/invalid
        setAccessToken(null);
        setUser(null);
        setCurrentOrganization(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [fetchMe]);

  const login = async (input: LoginInput) => {
    const res = await apiClient.post<{
      user: User;
      organization: CurrentOrganization;
      accessToken: string;
      accessibleOrganizations?: AccessibleOrganization[];
    }>('/auth/login', input);

    setAccessToken(res.data.accessToken);
    await fetchMe();
    clearTenantData();
  };

  const register = async (input: RegisterInput) => {
    const res = await apiClient.post<{
      user: User;
      organization: CurrentOrganization;
      accessToken: string;
    }>('/auth/register', input);

    setAccessToken(res.data.accessToken);
    await fetchMe();
    clearTenantData();
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Continue client cleanup even if network fails
    } finally {
      setAccessToken(null);
      setUser(null);
      setCurrentOrganization(null);
      setAccessibleOrganizations([]);
      clearTenantData();
    }
  };

  const switchOrganization = async (targetOrganizationId: string) => {
    // 1. Backend call to switch session
    const res = await apiClient.post<{
      accessToken: string;
      organization: { id: string; name: string; slug: string };
    }>('/auth/switch-org', { targetOrganizationId });

    // 2. Replace the in-memory token ONLY after the backend succeeds
    setAccessToken(res.data.accessToken);

    // 3. Clear tenant-specific UI data
    clearTenantData();

    // 4. Refetch /auth/me for fresh role & accessible orgs
    await fetchMe();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        currentOrganization,
        accessibleOrganizations,
        isLoading,
        tenantGeneration,
        login,
        register,
        logout,
        switchOrganization,
        refreshProfile: fetchMe,
        clearTenantData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
