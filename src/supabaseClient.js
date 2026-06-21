import { createClient } from "@supabase/supabase-js";

// Supabaseプロジェクトの情報
// ※ Vercelにデプロイする際は環境変数(.env)に移すのが望ましいですが、
//    まずは動作確認のため直接記述しています。
const SUPABASE_URL = "https://gauhclpucrumctcxmepg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_FxyTcH_63zYv5Jb2pJHH_w_p5ojPaTe";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
