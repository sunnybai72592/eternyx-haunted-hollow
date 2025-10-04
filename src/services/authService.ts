
import { supabase } from "../lib/supabaseClient";

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + "/profile", // Redirect to profile page after sign-in
    },
  });

  if (error) {
    console.error("Error signing in with Google:", error.message);
    return { error };
  }

  return { data };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Error signing out:", error.message);
    return { error };
  }
  return { success: true };
};

export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Error getting session:", error.message);
    return { error };
  }
  return { data };
};

