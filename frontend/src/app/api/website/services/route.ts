import { cmsList, cmsCreate } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

export const GET = cmsList("website_services");
export const POST = cmsCreate("website_services", "service");