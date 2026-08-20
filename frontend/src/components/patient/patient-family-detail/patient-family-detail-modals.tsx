import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { fileToSquareImage } from "@/lib/square-image";
import { flexBetween, ghostIconBtn, modalBackdrop, mutedXsMt1 } from "@/lib/ui-constants";
import { BLOOD_GROUPS, FamilyMember, GENOTYPES, RELATIONSHIPS, ngn } from "@/lib/patient-family-shared";
import { inputCls, labelCls, type InvoiceRow } from "./patient-family-detail-shared";

export function EditMemberModal({
  member,
  busy,
  onClose,
  onSave,
}: {
  member: FamilyMember;
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      setPhoto(await fileToSquareImage(file));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not read that image");
    } finally {
      setPhotoBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div
      className={modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Edit Dependant"
    >
      <div className="my-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className={flexBetween}>
          <h2 className="text-lg font-bold">Edit Dependant</h2>
          <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const body: Record<string, unknown> = {
              first_name: fd.get("firstName"),
              last_name: fd.get("lastName"),
              gender: fd.get("gender") === "Female" ? "female" : fd.get("gender") === "Male" ? "male" : "other",
              date_of_birth: fd.get("dateOfBirth") || null,
              phone: fd.get("phone") || null,
              email: fd.get("email") || null,
              blood_group: fd.get("bloodGroup") || null,
              genotype: fd.get("genotype") || null,
              allergies: fd.get("allergies") || null,
              dependant_relationship: String(fd.get("relationship") ?? "other").toLowerCase(),
            };
            if (photo) body.avatar = photo;
            else if (!member.avatar_url && fd.get("clearPhoto") === "1") body.avatar = null;
            onSave(body);
          }}
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="Avatar preview" className="h-20 w-20 rounded-2xl object-cover ring-2 ring-[#e0a84a]" />
              ) : member.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={member.avatar_url} alt={member.first_name} className="h-20 w-20 rounded-2xl object-cover ring-2 ring-[#e0a84a]" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0b2a4a] to-[#0d5f7a] text-[#e0a84a]">
                  <Camera size={26} aria-hidden="true" />
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={photoBusy}
                className="focus-ring absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#e0a84a] to-amber-500 text-[#0a0f1a] shadow-md disabled:opacity-60"
                aria-label="Upload photo"
              >
                {photoBusy ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#0a0f1a]/40 border-t-[#0a0f1a]" /> : <Camera size={13} />}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFile} />
            </div>
            <div className="min-w-0 flex-1 text-xs text-[var(--color-muted-fg)]">
              {member.avatar_url && !photo && (
                <label className="flex items-center gap-1.5 font-medium text-rose-500">
                  <input type="checkbox" name="clearPhoto" value="1" className="h-3.5 w-3.5 accent-rose-500" /> Remove current photo
                </label>
              )}
              <span className="mt-0.5 block text-[11px] text-amber-500">{photoError ?? "JPG or PNG — max 2 MB"}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="firstName" required defaultValue={member.first_name} placeholder="First name" className={inputCls} />
            <input name="lastName" required defaultValue={member.last_name} placeholder="Last name" className={inputCls} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="ed-dob">Date of birth</label>
              <input id="ed-dob" name="dateOfBirth" type="date" defaultValue={member.date_of_birth?.slice(0, 10) ?? ""} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-sex">Sex</label>
              <select id="ed-sex" name="gender" className={inputCls} defaultValue={member.gender ? member.gender[0]?.toUpperCase() + member.gender.slice(1) : ""}>
                <option value="">Select…</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="ed-blood">Blood group</label>
              <select id="ed-blood" name="bloodGroup" className={inputCls} defaultValue={member.blood_group ?? ""}>
                <option value="">Select…</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-geno">Genotype</label>
              <select id="ed-geno" name="genotype" className={inputCls} defaultValue={member.genotype ?? ""}>
                <option value="">Select…</option>
                {GENOTYPES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="ed-rel">Relationship</label>
              <select id="ed-rel" name="relationship" className={inputCls} defaultValue={member.dependant_relationship ?? "other"}>
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r.toLowerCase()}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="ed-phone">Phone</label>
              <input id="ed-phone" name="phone" type="tel" defaultValue={member.phone ?? ""} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="ed-email">Email</label>
            <input id="ed-email" name="email" type="email" defaultValue={member.email ?? ""} className={inputCls} />
          </div>

          <div>
            <label className={labelCls} htmlFor="ed-allergies">Allergies</label>
            <textarea id="ed-allergies" name="allergies" rows={2} defaultValue={member.allergies ?? ""} className={inputCls} placeholder="e.g. penicillin, latex — leave blank if none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-gradient-to-br from-[#e0a84a] to-amber-500 py-2.5 text-sm font-semibold text-[#0a0f1a] shadow-md transition-transform hover:scale-[1.01] disabled:opacity-60">
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PayModal({
  invoice,
  busy,
  onClose,
  onPay,
}: {
  invoice: InvoiceRow;
  busy: boolean;
  onClose: () => void;
  onPay: (form: FormData) => void;
}) {
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; bank_name: string; account_name: string | null; account_number: string | null }>>([]);
  const [gateway, setGateway] = useState<{ enabled: boolean } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const outstanding = Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount));

  useEffect(() => {
    fetch("/api/settings/bank-accounts", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (b.data) setBankAccounts(b.data);
      })
      .catch(() => {});
    fetch("/api/payments/gateway-status", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setGateway(b.data ?? null))
      .catch(() => {});
  }, []);

  return (
    <div
      className={modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Pay invoice"
    >
      <div className="my-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className={flexBetween}>
          <h2 className="text-lg font-bold">Pay {invoice.invoice_number}</h2>
          <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {loadErr && (
          <p className="mt-3 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]">{loadErr}</p>
        )}
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onPay(new FormData(e.currentTarget));
          }}
        >
          <div>
            <label className={labelCls} htmlFor="pay-amount">Amount</label>
            <input
              id="pay-amount"
              name="amount"
              type="number"
              min="1"
              step="0.01"
              max={outstanding}
              defaultValue={outstanding}
              className={inputCls}
            />
            <p className={mutedXsMt1}>Outstanding: {ngn(outstanding)}</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="pay-method">Payment method</label>
            <select id="pay-method" name="method" className={inputCls} defaultValue={gateway?.enabled ? "online" : bankAccounts.length > 0 ? "bank_transfer" : "pos"}>
              {gateway?.enabled && <option value="online">Pay online (card)</option>}
              <option value="bank_transfer">Bank transfer</option>
              <option value="pos">POS / cash at the hospital</option>
            </select>
            {bankAccounts.length > 0 && (
              <p className="mt-1.5 text-xs text-[var(--color-muted-fg)]">
                Bank transfer details:{" "}
                {bankAccounts.map((b) => `${b.bank_name} ${b.account_number ?? ""} (${b.account_name ?? "—"})`).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="focus-ring flex-1 rounded-lg bg-gradient-to-br from-[#e0a84a] to-amber-500 py-2.5 text-sm font-semibold text-[#0a0f1a] shadow-md transition-transform hover:scale-[1.01] disabled:opacity-60">
              {busy ? "Sending…" : "Declare payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
