// Configuración pública del cliente. La clave "publishable" está pensada
// para el navegador: todo acceso a datos lo controla RLS en el servidor.
// NUNCA colocar aquí la clave service_role.
export const CONFIG = {
  supabaseUrl: "https://mxsfdvpxsbakvsometpk.supabase.co",
  supabaseKey: "sb_publishable_NkB4WcctEUz_FlbIJCSzlg_Rnhwlj2p",
  producto: "Docencia360",
  // Modalidades disponibles para registro en esta versión
  modalidadesAbiertas: ["profesor", "academia"],
};
