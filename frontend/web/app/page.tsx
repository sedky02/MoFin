import { redirect } from "next/navigation";

// proxy.ts gates this route: logged-out users are redirected to /login before
// they reach here; logged-in users land on the dashboard.
export default function RootPage() {
  redirect("/dashboard");
}
