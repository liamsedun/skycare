import type { TenantSiteProfile } from "@/lib/tenant-site";

/** Tenant-site brand mark — mirrors Life Blossom's Logo (rounded logo chip +
 * name + subtitle). White text when over the dark hero (not scrolled). */
export function TenantLogo({
  tenant,
  scrolled,
  hideSubtitle = false,
}: {
  tenant: TenantSiteProfile;
  scrolled?: boolean;
  hideSubtitle?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
        {tenant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logo_url}
            alt={tenant.name}
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[#0F4C81] text-sm font-bold text-white">
            {tenant.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div>
        <p
          className={
            "text-lg font-bold tracking-tight transition-colors md:text-xl " +
            (scrolled ? "text-[#0F4C81]" : "text-white")
          }
        >
          {tenant.name}
        </p>
        <p
          className={
            "line-clamp-1 text-[11px] leading-tight transition-colors " +
            (scrolled ? "text-[#6B7A90]" : "text-white/60") +
            (hideSubtitle ? " hidden" : "")
          }
        >
          {tenant.tagline?.replace(/\s*—.*/, "") || "Hospital"}
        </p>
      </div>
    </div>
  );
}