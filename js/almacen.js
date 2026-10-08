// Sesiones guardadas en el propio celular (IndexedDB). Nada sale del telefono.
const NOMBRE = "detector-reacciones", ALMACEN = "sesiones";

function abrir() {
  return new Promise((resolver, rechazar) => {
    const pet = indexedDB.open(NOMBRE, 1);
    pet.onupgradeneeded = () => pet.result.createObjectStore(ALMACEN, { keyPath: "id" });
    pet.onsuccess = () => resolver(pet.result);
    pet.onerror = () => rechazar(pet.error);
  });
}
async function operar(modo, fn) {
  const db = await abrir();
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction(ALMACEN, modo);
    const pet = fn(tx.objectStore(ALMACEN));
    tx.oncomplete = () => resolver(pet?.result);
    tx.onerror = () => rechazar(tx.error);
  });
}
export async function guardarSesion(datos) {
  const id = datos.id || `s${Date.now()}`;
  await operar("readwrite", s => s.put({ ...datos, id }));
  return id;
}
export async function listarSesiones() {
  try {
    const todas = await operar("readonly", s => s.getAll());
    return (todas || []).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  } catch (e) { return []; }
}
export async function borrarSesion(id) { return operar("readwrite", s => s.delete(id)); }
