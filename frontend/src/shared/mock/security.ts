export interface BackupFile {
  name: string;
  size: number;
}

export interface LoginAttempt {
  id: number;
  username: string;
  ip_address: string;
  attempt_time: string;
  failures: number;
}

export const backups: BackupFile[] = [
  { name: "crm-2026-09-29-0300.dump.gz", size: 18_482_176 },
  { name: "crm-2026-09-28-0300.dump.gz", size: 18_311_680 },
  { name: "crm-2026-09-27-0300.dump.gz", size: 18_104_320 },
  { name: "crm-2026-09-26-0300.dump.gz", size: 17_952_768 },
];

export const loginAttempts: LoginAttempt[] = [
  {
    id: 1,
    username: "admin@detroid.ru",
    ip_address: "45.148.10.152",
    attempt_time: "2026-09-29 04:18:22",
    failures: 5,
  },
  {
    id: 2,
    username: "root",
    ip_address: "45.148.10.151",
    attempt_time: "2026-09-29 03:51:07",
    failures: 5,
  },
  {
    id: 3,
    username: "d.kuznetsov@detroid.ru",
    ip_address: "95.161.220.14",
    attempt_time: "2026-09-28 18:02:44",
    failures: 2,
  },
  {
    id: 4,
    username: "test@detroid.ru",
    ip_address: "185.244.25.9",
    attempt_time: "2026-09-28 11:30:19",
    failures: 3,
  },
];
