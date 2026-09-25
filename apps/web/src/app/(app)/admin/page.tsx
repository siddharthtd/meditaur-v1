import { AdminPanel } from "@/features/admin/AdminPanel";

/**
 * The admin panel's route (`P0 · 23`, slice 23f).
 *
 * No `Suspense` boundary, unlike `/database`: the panel keeps its selection in state
 * rather than in the address, so nothing it draws suspends on the query string.
 *
 * It sits in the `(app)` group and therefore draws the nav, and it is deliberately **not**
 * one of `AppNav`'s links — the door is a link on `/account`, shown to an admin, because
 * the panel is the owner's tool rather than a destination for a reader. A non-admin who
 * types the address gets a sentence, here and again from the function.
 */
export default function AdminPage() {
  return <AdminPanel />;
}
