import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PharmacyIndexPage() {
  redirect("/app/pharmacy/dashboard");
}