export const PATIENT_GRADIENTS = [
  "from-sky-500 to-blue-600",
  "from-violet-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-400 to-orange-500",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
];

export function patientInitials(first: string, last: string): string {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "PT";
}

export function patientGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % PATIENT_GRADIENTS.length;
  return PATIENT_GRADIENTS[hash];
}
