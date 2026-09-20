const API_URL =
  "http://localhost:5000/api/auth/google";

export async function loginWithGoogle(credential) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      credential,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || data.message || "Google sign-in failed."
    );
  }

  return data.user;
}