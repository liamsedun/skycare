import { cmsUpdate, cmsDelete } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

export const PUT = cmsUpdate("website_departments", "department");
export const DELETE = cmsDelete("website_departments", "department");