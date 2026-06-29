import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

describe("Supabase Integration", () => {
  it("should connect to Supabase with valid credentials", async () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(supabaseUrl).toBeDefined();
    expect(supabaseServiceKey).toBeDefined();

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Test basic connection by querying the auth schema
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error("Supabase connection error:", error);
      throw new Error(`Failed to connect to Supabase: ${error.message}`);
    }

    expect(data).toBeDefined();
    expect(Array.isArray(data.users)).toBe(true);
  });
});
