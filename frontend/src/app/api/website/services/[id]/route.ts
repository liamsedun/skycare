import { cmsUpdate, cmsDelete } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

export const PUT = cmsUpdate("website_services", "service");
export const DELETE = cmsDelete("website_services", "service");