import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Accountant, User } from "@/shared/types";
import { api } from "../client";
import {
  accountantSchema,
  arraySchema,
  backupTaskResponseSchema,
  backupsResponseSchema,
  loginAttemptSchema,
  userSchema,
} from "../schemas";
import type { BackupsResponse, LoginAttempt } from "../schemas";
import { apiVoid, keys } from "./shared";

// --- Администрирование ---
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

export function useAdminAccountants() {
  return useQuery({
    queryKey: keys.adminAccountants,
    queryFn: () =>
      api<Accountant[]>("/admin/accountants", { schema: arraySchema(accountantSchema) }),
  });
}

function invalidateAccountantLists(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: keys.accountants });
  void qc.invalidateQueries({ queryKey: keys.adminAccountants });
}

export function useCreateAccountant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) =>
      api<Accountant>("/admin/accountants", { method: "POST", body, schema: accountantSchema }),
    onSuccess: () => invalidateAccountantLists(qc),
  });
}

export function useUpdateAccountant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api<Accountant>(`/admin/accountants/${id}`, {
        method: "PATCH",
        body: { name },
        schema: accountantSchema,
      }),
    onSuccess: () => invalidateAccountantLists(qc),
  });
}

export function useDeleteAccountant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiVoid(`/admin/accountants/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateAccountantLists(qc),
  });
}

export function useRestoreAccountant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<Accountant>(`/admin/accountants/${id}/restore`, {
        method: "POST",
        schema: accountantSchema,
      }),
    onSuccess: () => invalidateAccountantLists(qc),
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
      // Файл появится через несколько секунд — список обновим с задержкой.
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
