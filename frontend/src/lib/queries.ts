import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Parameter, Permission, Role, SamplingPoint } from './types';

export function useSamplingPoints(includeInactive = false, enabled = true) {
  return useQuery({
    queryKey: ['sampling-points', includeInactive],
    queryFn: () => api<SamplingPoint[]>('/sampling-points', { query: { includeInactive } }),
    enabled,
  });
}

export function useParameters(includeInactive = false, enabled = true) {
  return useQuery({
    queryKey: ['parameters', includeInactive],
    queryFn: () => api<Parameter[]>('/parameters', { query: { includeInactive } }),
    enabled,
  });
}

export function useRoles(enabled = true) {
  return useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles'), enabled });
}

export function usePermissions(enabled = true) {
  return useQuery({ queryKey: ['permissions'], queryFn: () => api<Permission[]>('/permissions'), enabled });
}
