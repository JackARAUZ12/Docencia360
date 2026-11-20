// Pone ícono, nombre y versión al Docencia360.exe sin necesitar Windows ni Wine
// (para poder construir el instalador también desde Linux).
const fs = require("node:fs");
const path = require("node:path");
exports.default = async function despuesDeEmpaquetar(ctx) {
  if (ctx.electronPlatformName !== "win32") return;
  const ResEdit = await import("resedit");
  const R = ResEdit.default || ResEdit;
  const version = ctx.packager.appInfo.version;
  const exe = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.exe`);
  const ico = path.join(ctx.packager.info.projectDir, "recursos", "icono.ico");
  const datos = R.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = R.NtExecutableResource.from(datos);
  if (fs.existsSync(ico)) {
    const grupo = R.Data.IconFile.from(fs.readFileSync(ico));
    R.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, grupo.icons.map((i) => i.data));
  }
  const vi = R.Resource.VersionInfo.fromEntries(res.entries)[0] || R.Resource.VersionInfo.createEmpty();
  const [a, b, c] = version.split(".").map(Number);
  vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: "Docencia360", ProductName: "Docencia360", CompanyName: "Docencia360", LegalCopyright: "Docencia360",
    InternalName: "Docencia360", OriginalFilename: "Docencia360.exe", FileVersion: version, ProductVersion: version,
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(datos);
  fs.writeFileSync(exe, Buffer.from(datos.generate()));
  console.log(`  • ícono y versión ${version} puestos en ${path.basename(exe)}`);
};
