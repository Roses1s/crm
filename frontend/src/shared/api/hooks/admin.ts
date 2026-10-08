import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { User } from "@/shared/types";
import { api } from "../client";
import {
  arraySchema,
  backupTaskResponseSchema,
  backupsResponseSchema,
  loginAttemptSchema,
  userSchema,
} from "../schemas";
import type { BackupsResponse, LoginAttempt } from "../schemas";
import { apiVoid, keys } from "./shared";

// --- администрирование -------------------------------------------------------
export function useUsers() {
  return useQuery({
    queryKey: keys.users,
    queryFn: () => api<User[]>("/admin/users", { schema: arraySchema(userSchema) }),
  });
}

interface UserPayload {
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  password?: string;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserPayload) =>
      api<User>("/admin/users", { method: "POST", body, schema: userSchema }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.users }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<UserPayload>) =>
      api<User>(`/admin/users/${id}`, { method: "PATCH", body, schema: userSchema }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.users }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiVoid(`/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.users }),
  });
}

export function useBackups() {
  return useQuery({
    queryKey: keys.backups,
    queryFn: () => api<BackupsResponse>("/admin/backups", { schema: backupsResponseSchema }),
  });
}

export function useRunBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ task_id: string; detail: string }>("/admin/backup", {
        method: "POST",
        schema: backupTaskResponseSchema,
      }),
    onSuccess: () => {
      // Файл появится через несколько секунд — обновим список с задержкой.
      setTimeout(() => void qc.invalidateQueries({ queryKey: keys.backups }), 4000);
    },
  });
}

export function useDeleteBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiVoid(`/admin/backups/${encodeURIComponent(name)}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.backups });
    },
  });
}

export function useLoginAttempts() {
  return useQuery({
    queryKey: keys.loginAttempts,
    queryFn: () =>
      api<LoginAttempt[]>("/admin/login-attempts", {
        schema: arraySchema(loginAttemptSchema),
      }),
  });
}
