// Configuración pública del cliente. La clave "publishable" está pensada
// para el navegador: todo acceso a datos lo controla RLS en el servidor.
// NUNCA colocar aquí la clave service_role.
export const CONFIG = {
  supabaseUrl: "https://srhgoiovnnpaiddfehah.supabase.co",
  supabaseKey: "sb_publishable_nwTjVifyV96xwGxzwUTQ5A_Tv5OtsMQ",
  producto: "Docencia360",
  // Modalidades disponibles para registro en esta versión
  modalidadesAbiertas: ["profesor", "academia", "colegio"],
};
