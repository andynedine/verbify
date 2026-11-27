// =====================================================================
//  CONFIGURACIÓN DE VERBIFY
//  Pega aquí los datos de tu proyecto de Supabase
//  (Supabase > Project Settings > API).
//  Mientras estén vacíos, la app funciona en MODO DEMO: los datos se
//  guardan solo en este navegador.
// =====================================================================
export const CONFIG = {
  SUPABASE_URL: 'https://msgehtbymgcqidzxaggc.supabase.co',        // ej.: 'https://abcdefghijk.supabase.co'
  SUPABASE_ANON_KEY: 'sb_publishable_cAvcxTjWyHH2KTgJ3Co_bw_rQuMqC8e',   // la clave "anon public" (es pública, puede ir aquí)

  // Supabase necesita un email para cada usuario. Verbify lo construye
  // a partir del nick (lucia -> lucia@verbify.app) y NUNCA envía correos.
  // Si al registrarte Supabase dice "email inválido", cambia este dominio
  // por uno que sea tuyo.
  EMAIL_DOMAIN: 'verbify.app',
};
