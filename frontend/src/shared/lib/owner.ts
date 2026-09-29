type LeadOwner = {
  assigned_to_name?: string;
  assigned_to_email?: string | null;
};

/** Подпись ответственного: ФИО, если заполнено, иначе email. */
export function ownerLabel(lead: LeadOwner): string {
  return lead.assigned_to_name?.trim() || lead.assigned_to_email?.trim() || "";
}

/** Две буквы для аватара: инициалы имени, иначе начало email. */
export function ownerInitials(lead: LeadOwner): string {
  const name = lead.assigned_to_name?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }
  const email = lead.assigned_to_email?.trim();
  if (!email) return "—";
  return email.split("@")[0].slice(0, 2).toUpperCase();
}
