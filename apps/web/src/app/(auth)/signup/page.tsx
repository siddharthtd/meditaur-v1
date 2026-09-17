"use client";

import { AuthPanel } from "@/features/auth/AuthPanel";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold">Create an account</h1>
      <AuthPanel mode="signUp" />
    </main>
  );
}
