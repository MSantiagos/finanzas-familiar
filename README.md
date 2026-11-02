# 🛡️ Finanzas Familiar — PWA + Escudo CMR + Sincronización CRDT-Lite & Google Sheets

Aplicación web progresiva (**PWA Offline-First**) diseñada para que **Mauricio y Marie** registren gastos familiares en **5 segundos** desde el iPhone, controlen con precisión matemática la **Reserva de Pago de la CMR Falabella** (con arrastre multi-mes), transparenten los **Traspasos a la Cuenta de Marie** sin duplicar gastos, desglosen boletas mixtas con **Gemini Flash** y concilien cartolas del **Banco de Chile** y **CMR Falabella** con un motor antiduplicados de 7 capas.

---

## 🚀 Inicio en 1 Clic (Windows, Mac & iPhones en WiFi)

El proyecto incluye un servidor local multihilo (`server.py`) con fusión determinista **CRDT-Lite** en tiempo real (`data/family_state.json`). Permite que el computador y los iPhones de Mauricio y Marie operen simultáneamente en el WiFi de la casa sin sobrescribirse jamás.

### 🪟 En Windows (1 clic)
Haz doble clic sobre **`Iniciar_Finanzas_Familiar.bat`**.
- Detecta automáticamente `python` o `py` en el sistema.
- Muestra en consola la URL local (`http://localhost:8090`) y la IP WiFi local (`http://192.168.x.x:8090`) para los iPhones de Mauricio y Marie.
- Abre automáticamente el navegador predeterminado en `http://localhost:8090` e inicia `server.py`.

### 🍎 En macOS (1 clic)
Haz doble clic sobre **`Iniciar_Finanzas_Familiar.command`** (o ejecuta `./Iniciar_Finanzas_Familiar.command` en Terminal).
- Detecta automáticamente la IP WiFi local de tu Mac (`en0`/`en1`).
- Abre el navegador en `http://localhost:8090` y levanta `python3 server.py`.

### 📱 Instalación como App Nativa (PWA) en los iPhones de Mauricio y Marie
1. Con el servidor encendido (o desde GitHub Pages), abre Safari en el iPhone o apunta la cámara al **código QR** de la pestaña **`☁️ iPhone & IA`**.
2. En el menú inferior de Safari, toca **Compartir → "Agregar a pantalla de inicio"**.
3. La app se abrirá a pantalla completa (`viewport-fit=cover`, soporte para Dynamic Island / FaceID, modo oscuro OLED y Service Worker `v9` con caché inteligente offline).
4. Mantén presionado el ícono de la app en la pantalla de inicio para acceder a los **Accesos Rápidos (Shortcuts)**:
   - **⚡ Registrar Gasto Rápido**
   - **🔍 Conciliar Cartola**

---

## ☁️ Sincronización 4G/5G con Google Sheets (4 Hojas Ejecutivas Automáticas)

Para sincronizar fuera de casa con datos móviles (4G/5G) y mantener un respaldo auditable en Google Drive:

1. Crea una planilla nueva en [sheets.new](https://sheets.new) y abre **Extensiones → Apps Script**.
2. Pega el contenido íntegro de [`google-sheets-sync/Code.gs`](./google-sheets-sync/Code.gs).
3. Haz clic en **Implementar → Nueva implementación → Aplicación web** (*Ejecutar como: Yo* / *Quién tiene acceso: Cualquier persona*).
4. Pega la URL generada en la pestaña **`☁️ iPhone & IA`** de la aplicación y presiona **Guardar y Sincronizar**.

Cada vez que sincronizas, el motor CRDT-Lite fusiona transacciones por ID, respeta eliminaciones (*tombstones*) y genera/actualiza automáticamente **4 hojas legibles y formateadas** en tu Google Sheets (además de la hoja técnica `_DB_Sync`):

| Hoja Automática | Contenido Ejecutivo |
| :--- | :--- |
| **`Movimientos`** | Libro mayor cronológico con fecha, tipo, categoría con ícono, glosa/nota, monto en CLP, medio de pago, autor (`Mauricio` / `Marie`) y estado de conciliación bancaria. |
| **`Resumen_Mensual`** | Estado de resultados mensual: Ingresos reales vs. meta, Meta de Ahorro Blindada, Presupuesto vs. Gasto Real por categoría, % de consumo y margen disponible. |
| **`Escudo_CMR_y_Mujer`** | Auditoría acumulada con arrastre multi-mes (*rollover*) de la **Reserva Intocable para pagar CMR Falabella** y del **Saldo Disponible en Cuenta Marie** (Transferencias enviadas vs. Compras rendidas). |
| **`Prestamos_y_Fijos`** | Sub-libro mayor de préstamos y cuentas compartidas ("vaca") desglosado por persona (saldo por cobrar y por pagar) + estado de la plantilla de Gastos Fijos mensuales. |

---

## 🔍 Las 7 Capas del Conciliador Antiduplicados + Super-Diccionario Chileno

El módulo [`src/services/reconciler.js`](./src/services/reconciler.js) procesa archivos `.xls`, `.xlsx`, `.csv` o texto copiado directamente desde el **Banco de Chile** (Cuenta Corriente / Cuenta FAN) y **CMR Falabella**, aplicando **7 capas de blindaje** para que ningún gasto ni abono se duplique jamás:

1. **Capa 1 — Huella Digital Bancaria Exacta (`bankFingerprint`):** Bloquea instantáneamente cualquier movimiento si subes dos veces la misma cartola o si sus rangos de fechas se solapan.
2. **Capa 2 — Detección de Traspasos Internos y Pago de Tarjeta CMR:** Identifica automáticamente transferencias entre cuentas propias (`transfer_self`), traspasos a la cuenta de Marie (`transfer_wife`) y pagos de facturación de tarjeta (`cmr_payment`), impidiendo que se cobren dos veces en el presupuesto.
3. **Capa 3 — Calce de Cuotas CMR Programadas (`Cuota X/Y`):** Reconoce compras en cuotas en la cartola (ej. `CUOTA 02/03`, `01 de 06`) y las enlaza con las cuotas generadas automáticamente al registrar la compra original.
4. **Capa 4 — Calce Difuso Multi-Mes con Tolerancia de Redondeo (±5 días / ±4%):** Si anotaste rápido `$15.000` en el celular y el cargo en cartola fue por `$14.890` dos días después (incluso cruzando del 30/31 de un mes al 1/2 del mes siguiente), el conciliador detecta la coincidencia y ajusta el monto exacto del banco sin duplicar.
5. **Capa 5 — Conciliación de Boletas Mixtas Divididas y Cuentas Compartidas (`receiptGroupId`):** Cuando una compra de `$89.400` en el supermercado fue dividida en *Supermercado ($58.000) + Hija ($21.400) + Gustos ($10.000)* (manualmente o con **Gemini Flash**), el conciliador suma las partes del grupo y las cruza automáticamente contra el cargo único de `$89.400` del banco.
6. **Capa 6 — Cruce Inteligente de Préstamos y "Vaca" por Persona:** Cruza transferencias salientes o abonos entrantes con el libro de préstamos por contacto (ej. si le prestaste `$50.000` a *Juanito* y luego entra un `TRASPASO DE: JUANITO` por `$50.000`, preselecciona *"🤝 Me devolvieron plata que me debían"*).
7. **Capa 7 — Memoria Familiar de Contactos Aprendidos + Super-Diccionario de +300 Comercios Chilenos:** Clasifica automáticamente más de **300 comercios y glosas reales de Chile** (Lider, Jumbo, Unimarc, Tottus, Santa Isabel, Feria, Cruz Verde, Salcobrand, Dr. Simi, Copec, Shell, Autopistas TAG, Uber, Cabify, Metro/Bip, Enel, Aguas Andinas, Metrogas, PedidosYa, Rappi, Starbucks, Sodimac, Easy, Clínicas, Jardín/Sala Cuna, etc.) y recuerda para siempre a qué categoría asignaron cualquier transferencia a terceros.

---

## 🖨️ Informe Financiero Familiar en PDF y Exportación Excel (`.xlsx`)

- **Informe Mensual PDF (`Ctrl+P` / `Cmd+P`):** La hoja de estilos incluye reglas `@media print` diseñadas para ocultar formularios, botones de edición y barras flotantes, generando un **Informe Financiero Familiar Mensual en formato A4** limpio y listo para archivar.
- **Libro Microsoft Excel (`.xlsx`):** Con 1 clic en **`📊 Excel`**, descarga un archivo `.xlsx` nativo con hojas estructuradas para análisis externo.

---

## 🧪 Batería de Tests Automatizados

El proyecto cuenta con pruebas automatizadas para validar el motor contable, el conciliador bancario de 7 capas y la fusión determinista CRDT-Lite del servidor:

### 1. Ejecutar tests de JavaScript / Node.js (Motor Financiero y Conciliador)
```bash
node --test
```

### 2. Ejecutar tests de Python (Servidor WiFi y Fusión CRDT-Lite)
```bash
python -m unittest
```
*(En macOS puedes usar `python3 -m unittest`).*
