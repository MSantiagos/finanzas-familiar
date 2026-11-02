# 🛡️ Finanzas Familiar — PWA + Escudo CMR + Sincronización Google Sheets

Aplicación web progresiva (**PWA**) diseñada para registrar gastos familiares en **5 segundos**, controlar la **Reserva de Pago de la CMR Falabella**, transparentar los **Traspasos a la Cuenta de tu Mujer** sin duplicar gastos, desglosar boletas mixtas con **Gemini 3.8 Flash** y conciliar cartolas del **Banco de Chile** y **CMR**.

---

## 🚀 Cómo abrir la aplicación

### Opción 1: En tu Mac (1 clic)
Haz doble clic sobre el archivo [`Iniciar_Finanzas_Familiar.command`](./Iniciar_Finanzas_Familiar.command) o ejecuta en la terminal:
```bash
python3 -m http.server 8090
```
Y entra a: **`http://localhost:8090`**

### Opción 2: Instalarla en tu celular y el de tu mujer con 4G/5G (Gratis con GitHub Pages)
Dado que esta carpeta ya está en tu directorio de `GitHub/Finanzas Familiar`:
1. Sube este repositorio a tu cuenta de GitHub y activa **Settings → Pages → Branch: main**.
2. Tendrás un link `https://tu-usuario.github.io/Finanzas-Familiar/` que ambos pueden abrir en Safari (iPhone) o Chrome (Android) y tocar **"Agregar a pantalla de inicio"**.
3. Conecta tu hoja de **Google Sheets** siguiendo los 4 pasos de la pestaña **`☁️ Nube, Excel e IA`** usando el código de [`google-sheets-sync/Code.gs`](./google-sheets-sync/Code.gs) para que ambos teléfonos sincronicen desde cualquier lugar con 4G/5G y todo quede respaldado automáticamente en tu planilla de Google Drive.

---

## 📌 Las 4 Reglas de Oro del Método Familiar

1. **Regla de los 5 Segundos (Día a día):**
   Cada vez que tú o tu mujer compren algo, abren el ícono en el celular, digitan el monto, tocan la categoría (viendo al instante cuánto presupuesto queda en el semáforo) y guardan.
2. **Transferencias a tu Mujer = Traspaso Interno (No es gasto):**
   Cuando le transfieres plata desde tu Banco de Chile, regístralo en **`🔄 Transferencia a Mujer`**. Eso **no** resta presupuesto aún (evitando duplicar gastos). El presupuesto baja cuando ella registra en qué comercio usó esa plata.
3. **Escudo CMR Falabella:**
   Todo pago con CMR descuenta presupuesto **hoy** y se acumula en el indicador **`🟢 Reserva para pagar CMR`**. Ese monto debes mantenerlo intocable en tu Cuenta Corriente del Banco de Chile para pagar la facturación del mes siguiente sin tocar tus ahorros.
4. **Conciliación Semanal Antiduplicados (3 minutos el domingo):**
   Pega o sube los movimientos de tu Banco de Chile y CMR en **`🔍 Conciliar Cartola`**. El sistema bloquea automáticamente lo que ya anotaron en la semana y te muestra únicamente los gastos olvidados para agregarlos con un clic.
