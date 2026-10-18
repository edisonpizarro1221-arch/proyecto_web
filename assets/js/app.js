// Aplicación pública: catálogo, sesión, búsqueda, carrito y checkout.
// Pendiente de migración: lógica comercial de pago y movimientos de stock al backend.
import { auth, db } from './firebase.js';
import { createAdminDashboard } from './admin.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, increment, addDoc } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

const adminDashboard = createAdminDashboard({ db, notify: (message, type) => mostrarNotificacion(message, type), refresh: () => cargarInventarioFirestore() });

let inventario = [];
let carrito = [];
let productoSeleccionado = null;
let cantidadSeleccionada = 1;
let crearCuentaActivo = true;
let usuarioActual = null;
let esUsuarioAdmin = false;

function mostrarNotificacion(mensaje, tipo = 'exito') {
    const toast = document.getElementById('toast');
    const icono = document.getElementById('toast-icono');
    const texto = document.getElementById('toast-mensaje');

    toast.className = `toast-notificacion ${tipo}`;
    icono.innerText = (tipo === 'exito') ? '✔️' : '⚠️';
    texto.innerText = mensaje;
    toast.style.display = 'flex';

    setTimeout(() => { toast.style.display = 'none'; }, 3500);
}

onAuthStateChanged(auth, async (user) => {
    const headerAuth = document.getElementById('header-auth-actions');
    const navAdmin = document.getElementById('nav-admin-link');
    const puntosAdmin = document.getElementById('puntos-admin-link');
    const puntosPerfil = document.getElementById('puntos-link-perfil');

    if (user) {
        usuarioActual = user;
        esUsuarioAdmin = false;

        try {
            const docSnap = await getDoc(doc(db, "usuarios", user.uid));
            if (docSnap.exists()) {
                const data = docSnap.data();
                document.getElementById('chk-nombre').value = data.nombre || '';
                document.getElementById('chk-email').value = data.email || user.email;
                document.getElementById('chk-telefono').value = data.telefono || '';
                document.getElementById('chk-calle').value = data.direccion || '';
                if(data.region) document.getElementById('chk-region').value = data.region;
                if(data.comuna) document.getElementById('chk-comuna').value = data.comuna;

                document.getElementById('soporte-nombre').value = data.nombre || '';
                document.getElementById('soporte-email').value = data.email || user.email;
                document.getElementById('soporte-telefono').value = data.telefono || '';

                if (data.rol === 'admin') {
                    esUsuarioAdmin = true;
                }

                document.getElementById('grupo-password').style.display = 'none';
                document.getElementById('grupo-toggle-cuenta').style.display = 'none';

                headerAuth.innerHTML = `
                    <span class="user-tag-header" onclick="cambiarVista('perfil')" style="cursor:pointer;" title="Ver mi perfil">👤 ${data.nombre.split(' ')[0]}</span>
                    <button onclick="cambiarVista('perfil')" style="color:#bee3f8; font-size:0.85rem; font-weight:bold; cursor:pointer;" title="Mi perfil">Mi Perfil</button>
                    <button onclick="cerrarSesion()" style="color:#fed7d7; font-size:0.85rem; cursor:pointer;">Cerrar Sesión</button>
                    <a onclick="cambiarVista('carrito')" class="cart-btn-header">🛒 Carrito (<span id="cart-count-header">0</span>)</a>
                `;

                cargarDatosPerfilVista();
            }
        } catch(e) {
            console.log("Error perfil:", e);
        }

        if (navAdmin) navAdmin.style.display = esUsuarioAdmin ? 'inline-block' : 'none';
        if (puntosAdmin) puntosAdmin.style.display = esUsuarioAdmin ? 'block' : 'none';
        if (puntosPerfil) puntosPerfil.style.display = 'block';
    } else {
        usuarioActual = null;
        esUsuarioAdmin = false;
        document.getElementById('grupo-password').style.display = 'block';
        document.getElementById('grupo-toggle-cuenta').style.display = 'block';
        if (navAdmin) navAdmin.style.display = 'none';
        if (puntosAdmin) puntosAdmin.style.display = 'none';
        if (puntosPerfil) puntosPerfil.style.display = 'none';
        headerAuth.innerHTML = `
            <button onclick="abrirModalLogin()" style="font-weight:bold;">🔑 Iniciar Sesión</button>
            <a onclick="cambiarVista('carrito')" class="cart-btn-header">🛒 Carrito (<span id="cart-count-header">0</span>)</a>
        `;
    }
    adminDashboard.setAuthorized(esUsuarioAdmin);
    if (!esUsuarioAdmin && document.getElementById('vista-admin')?.classList.contains('activa')) {
        cambiarVista('inicio');
    }
    if (document.getElementById('vista-perfil')?.classList.contains('activa') && !usuarioActual) {
        cambiarVista('inicio');
    }
    actualizarContadorHeader();
});

window.abrirModalLogin = function() { document.getElementById('modal-login').classList.add('activa'); };
window.cerrarModalLogin = function() { document.getElementById('modal-login').classList.remove('activa'); };

window.cambiarTabAuth = function(tipo) {
    const btnLogin = document.getElementById('tab-login-btn');
    const btnRegistro = document.getElementById('tab-registro-btn');
    const divLogin = document.getElementById('form-auth-login');
    const divRegistro = document.getElementById('form-auth-registro');

    if (tipo === 'login') {
        btnLogin.style.color = '#1a365d';
        btnLogin.style.borderBottom = '3px solid #3182ce';
        btnRegistro.style.color = '#a0aec0';
        btnRegistro.style.borderBottom = 'none';
        divLogin.style.display = 'block';
        divRegistro.style.display = 'none';
    } else {
        btnRegistro.style.color = '#1a365d';
        btnRegistro.style.borderBottom = '3px solid #2f855a';
        btnLogin.style.color = '#a0aec0';
        btnLogin.style.borderBottom = 'none';
        divRegistro.style.display = 'block';
        divLogin.style.display = 'none';
    }
};

window.ejecutarLogin = async function() {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;

    if(!email || !pass) { 
        mostrarNotificacion('Completa los campos', 'error'); 
        return; 
    }

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        cerrarModalLogin();
        mostrarNotificacion('¡Sesión iniciada!', 'exito');
    } catch(e) {
        if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
            mostrarNotificacion('Correo no registrado', 'error');
        } else if (e.code === 'auth/wrong-password') {
            mostrarNotificacion('Contraseña incorrecta', 'error');
        } else {
            mostrarNotificacion('Correo o contraseña incorrectos', 'error');
        }
    }
};

window.recuperarContraseña = async function() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) {
        mostrarNotificacion('Escribe tu correo en la casilla de arriba', 'error');
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        mostrarNotificacion('Correo de recuperación enviado. Revisa tu bandeja de entrada', 'exito');
        cerrarModalLogin();
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            mostrarNotificacion('Correo no registrado', 'error');
        } else {
            mostrarNotificacion('Error al enviar el correo de recuperación', 'error');
        }
    }
};

window.ejecutarRegistroModal = async function() {
    const nombre = document.getElementById('reg-nombre').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const telefono = document.getElementById('reg-telefono').value.trim();
    const password = document.getElementById('reg-password').value;

    if (!nombre || !email || !telefono || !password) {
        mostrarNotificacion('Por favor completa todos los campos', 'error');
        return;
    }
    if (password.length < 6) {
        mostrarNotificacion('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "usuarios", userCredential.user.uid), {
            nombre, email, telefono, direccion: '', region: '', comuna: '', rol: 'cliente', fechaRegistro: new Date().toISOString()
        });
        cerrarModalLogin();
        mostrarNotificacion('¡Cuenta creada e iniciada con éxito!', 'exito');
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            mostrarNotificacion('Este correo ya está registrado. Inicia sesión.', 'error');
        } else {
            mostrarNotificacion('Error: ' + error.message, 'error');
        }
    }
};

window.cerrarSesion = async function() {
    await signOut(auth);
    mostrarNotificacion('Sesión cerrada', 'exito');
    cambiarVista('inicio');
};

window.enviarSolicitudSoporte = async function() {
    const nombre = document.getElementById('soporte-nombre').value.trim();
    const email = document.getElementById('soporte-email').value.trim();
    const telefono = document.getElementById('soporte-telefono').value.trim();
    const detalle = document.getElementById('soporte-detalle').value.trim();

    if(!nombre || !email || !telefono || !detalle) {
        mostrarNotificacion('Por favor completa todos los campos', 'error');
        return;
    }

    try {
        await addDoc(collection(db, "solicitudes_soporte"), {
            nombre,
            email,
            telefono,
            detalle,
            fecha: new Date().toISOString(),
            estado: 'pendiente'
        });

        mostrarNotificacion('¡Solicitud de soporte enviada con éxito!', 'exito');
        document.getElementById('soporte-detalle').value = '';
    } catch(e) {
        mostrarNotificacion('Error al enviar la solicitud', 'error');
    }
};

async function cargarInventarioFirestore() {
    try {
        const querySnapshot = await getDocs(collection(db, "productos"));
        if (!querySnapshot.empty) {
            let lista = [];
            querySnapshot.forEach((docSnap) => {
                let data = docSnap.data();

                if (data.sku !== 'SOPORTE-TEC') {
                    if (data.sku === 'ESP32-01') data.imagenUrl = 'esp32.png';
                    else if (data.sku === 'FPM10A-01') data.imagenUrl = 'huella.png';
                    else if (data.sku === 'KEY-3X4') data.imagenUrl = 'teclado.png';
                    else if (data.sku === 'LCD-1602') data.imagenUrl = 'lcd.png';

                    if (data.kits && data.kits.includes('basico')) {
                        data.imagenUrl = 'kit_basico.png';
                    }

                    lista.push({ id: docSnap.id, ...data });
                }
            });

            inventario = lista;
        }
    } catch (e) {
        console.error("Error inventario:", e);
        mostrarNotificacion("No fue posible sincronizar el inventario con Firestore", "error");
    }
    renderizarCatalogo();
    renderizarTablaAdmin();
}

window.irASeccionAreas = function() {
    cambiarVista('inicio');
    setTimeout(() => {
        const el = document.getElementById('seccion-areas');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
};

window.irASeccionBeneficios = function() {
    cambiarVista('inicio');
    setTimeout(() => {
        const el = document.getElementById('seccion-beneficios-compra');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
};

function sanitizarTexto(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

window.manejarBusquedaInput = function() {
    const inputEl = document.getElementById('input-buscador');
    const query = (inputEl.value || '').toLowerCase().trim();
    const container = document.getElementById('sugerencias-container');
    if (!container) return;
    container.innerHTML = '';

    if (!query) {
        container.style.display = 'none';
        return;
    }

    const sugerencias = [];

    // 1. SERVICIOS Y MANTENIMIENTO PREVENTIVO
    if (['manten', 'prevent', 'plan', 'calib', 'mantencion', 'limpieza', 'sensor', 'biometr'].some(t => query.includes(t) || t.includes(query))) {
        sugerencias.push({
            tipo: 'servicio',
            badge: 'SERVICIO',
            icono: '🛠️',
            titulo: 'Mantenimiento Preventivo de Accesos',
            sub: 'Calibración, limpieza y diagnóstico de lectores biométricos y chapas',
            accion: () => { cambiarVista('mantenimiento'); }
        });
        sugerencias.push({
            tipo: 'servicio',
            badge: 'PLANES',
            icono: '📑',
            titulo: 'Planes de Mantenimiento Preventivo',
            sub: 'Contratos semestrales y anuales con visitas técnicas programadas',
            accion: () => {
                cambiarVista('mantenimiento');
                setTimeout(() => {
                    const el = document.querySelector('.planes-grid') || document.querySelector('.mantenimiento-banner');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                }, 120);
            }
        });
    }

    // 2. SOPORTE TÉCNICO DE EMERGENCIA
    if (['sopor', 'emergen', 'falla', 'urgenc', 'tecnic', 'bloque', 'ayuda', 'ticket', 'atrapado'].some(t => query.includes(t) || t.includes(query))) {
        sugerencias.push({
            tipo: 'servicio',
            badge: 'EMERGENCIA 24/7',
            icono: '🚨',
            titulo: 'Soporte Técnico de Emergencia',
            sub: 'Asistencia inmediata y protocolos de contingencia ante fallos críticos',
            accion: () => { cambiarVista('soporte'); }
        });
    }

    // 3. GARANTÍA Y BENEFICIOS (Asegurado, Instalación, Asesoría, Postventa)
    if (['garant', 'asegur', 'instal', 'asesor', 'postvent', 'segur', 'benefic', 'respald', 'soporte post'].some(t => query.includes(t) || t.includes(query))) {
        sugerencias.push({
            tipo: 'beneficio',
            badge: 'GARANTÍA Y RESPALDO',
            icono: '🛡️',
            titulo: 'Compra Asegurada, Instalación y Postventa',
            sub: '100% asegurado, instalación certificada, asesoría técnica y soporte continuo',
            accion: () => { window.irASeccionBeneficios(); }
        });
    }

    // 4. ÁREAS DE APLICACIÓN Y SECTORES
    if (['area', 'sector', 'educa', 'colegio', 'universi', 'laborat', 'salud', 'clinic', 'hospital', 'data', 'server', 'rack', 'industr', 'bodega', 'oficina', 'empresa'].some(t => query.includes(t) || t.includes(query))) {
        sugerencias.push({
            tipo: 'area',
            badge: 'ÁREAS Y SECTORES',
            icono: '🏢',
            titulo: 'Áreas de Aplicación y Soluciones por Sector',
            sub: 'Educación, laboratorios, clínicas, data centers, oficinas e industria',
            accion: () => { window.irASeccionAreas(); }
        });
    }

    // 5. KITS COMPLETOS DE CONTROL Y RESPALDO
    if (query.includes('kit') || query.includes('basico') || query.includes('pack') || query.includes('sistema')) {
        sugerencias.push({
            tipo: 'kit',
            badge: 'KIT DE CONTROL',
            icono: '📦',
            titulo: 'Kit Básico de Respaldo y Acceso',
            sub: 'Solución integrada con autenticación digital, teclado y pantalla LCD',
            accion: () => { seleccionarKit('basico'); cambiarVista('repuestos'); }
        });
    }
    if (query.includes('kit') || query.includes('intermedio') || query.includes('bateria') || query.includes('energia')) {
        sugerencias.push({
            tipo: 'kit',
            badge: 'KIT DE CONTROL',
            icono: '📦',
            titulo: 'Kit Intermedio con Respaldo de Energía',
            sub: 'Batería de emergencia y cerradura electromagnética / perno',
            accion: () => { seleccionarKit('intermedio'); cambiarVista('repuestos'); }
        });
    }
    if (query.includes('kit') || query.includes('avanzado') || query.includes('iot') || query.includes('telegram')) {
        sugerencias.push({
            tipo: 'kit',
            badge: 'KIT DE CONTROL',
            icono: '📦',
            titulo: 'Kit Avanzado Corporativo IoT',
            sub: 'Notificaciones Telegram en tiempo real, WiFi y auditoría total',
            accion: () => { seleccionarKit('avanzado'); cambiarVista('repuestos'); }
        });
    }

    // 6. COMPONENTES Y PRODUCTOS EN INVENTARIO
    const prodsMatch = inventario.filter(prod => {
        const nom = (prod.nombre || '').toLowerCase();
        const sku = (prod.sku || '').toLowerCase();
        const cat = (prod.categoria || '').toLowerCase();
        const mod = (prod.modelo || '').toLowerCase();
        return nom.includes(query) || sku.includes(query) || cat.includes(query) || mod.includes(query);
    });

    prodsMatch.forEach(prod => {
        sugerencias.push({
            tipo: 'producto',
            badge: prod.categoria ? prod.categoria.toUpperCase() : 'COMPONENTE',
            icono: '🔍',
            titulo: prod.nombre,
            sub: `SKU: ${prod.sku} • $${Number(prod.precio || 0).toLocaleString('es-CL')} • Stock: ${prod.stock}`,
            accion: () => { verDetalle(prod.sku); }
        });
    });

    // RENDERIZAR RESULTADOS INTELIGENTES
    if (sugerencias.length > 0) {
        container.style.display = 'block';
        sugerencias.slice(0, 9).forEach(item => {
            const div = document.createElement('div');
            div.className = 'sugerencia-item';
            div.innerHTML = `
                <div class="sugerencia-item-header">
                    <span class="sugerencia-item-icono">${item.icono}</span>
                    <strong class="sugerencia-item-titulo">${sanitizarTexto(item.titulo)}</strong>
                    <span class="sugerencia-badge badge-${item.tipo}">${sanitizarTexto(item.badge)}</span>
                </div>
                <div class="sugerencia-item-sub">${sanitizarTexto(item.sub)}</div>
            `;
            div.onclick = function(e) {
                e.stopPropagation();
                item.accion();
                container.style.display = 'none';
                inputEl.value = '';
            };
            container.appendChild(div);
        });
    } else {
        container.style.display = 'block';
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'sugerencia-item sugerencia-vacia';
        emptyDiv.innerHTML = `🔍 No se encontraron sugerencias directas para "<strong>${sanitizarTexto(query)}</strong>". Presiona <strong>Enter</strong> o el botón <strong>Buscar</strong> para explorar el catálogo.`;
        container.appendChild(emptyDiv);
    }
    // NOTA CLAVE: No ejecutamos ejecutarBusquedaGlobal() aquí para mantener intacta la vista de fondo mientras se escribe.
};

window.ejecutarBusquedaGlobal = function() {
    const container = document.getElementById('sugerencias-container');
    if (container) container.style.display = 'none';

    const query = document.getElementById('input-buscador').value.toLowerCase().trim();
    if (!query) return;

    if (query.includes('soporte') || query.includes('emergencia') || query.includes('tecnico') || query.includes('urgenc')) {
        cambiarVista('soporte');
        return;
    }

    if (query.includes('mantencion') || query.includes('mantenimiento') || query.includes('preventivo') || query.includes('plan')) {
        cambiarVista('mantenimiento');
        return;
    }

    if (query.includes('area') || query.includes('sector') || query.includes('aplicacion')) {
        window.irASeccionAreas();
        return;
    }

    if (query.includes('garantia') || query.includes('asegura') || query.includes('postventa') || query.includes('instalacion') || query.includes('asesoria')) {
        window.irASeccionBeneficios();
        return;
    }

    if (query.includes('kit') && query.includes('basico')) {
        seleccionarKit('basico');
        cambiarVista('repuestos');
        return;
    }
    if (query.includes('kit') && query.includes('intermedio')) {
        seleccionarKit('intermedio');
        cambiarVista('repuestos');
        return;
    }
    if (query.includes('kit') && query.includes('avanzado')) {
        seleccionarKit('avanzado');
        cambiarVista('repuestos');
        return;
    }

    cambiarVista('repuestos');
    let visibles = 0;
    document.querySelectorAll('.prod-item').forEach(prod => {
        const texto = prod.innerText.toLowerCase();
        if (texto.includes(query)) {
            prod.style.display = 'flex';
            visibles++;
        } else {
            prod.style.display = 'none';
        }
    });
    const contador = document.getElementById('contador-productos');
    if(contador) contador.innerText = `${visibles} componente(s) disponible(s)`;
};

function renderizarCatalogo() {
    const grid = document.getElementById('grid-productos-dinamicos');
    grid.innerHTML = '';
    inventario.forEach(prod => {
        const div = document.createElement('div');
        div.className = 'card-producto prod-item';
        div.setAttribute('data-kits', prod.kits ? prod.kits.join(' ') : '');
        div.setAttribute('data-comp', prod.categoria || '');

        const tieneStock = prod.stock > 0;
        div.innerHTML = `
            <img src="${prod.imagenUrl || 'kit_basico.png'}" alt="${prod.nombre}" onclick="verDetalle('${prod.sku}')">
            <div class="modelo-tag">Modelo: ${prod.modelo || prod.sku}</div>
            <h4 onclick="verDetalle('${prod.sku}')">${prod.nombre}</h4>
            <div class="precio">$${prod.precio.toLocaleString('es-CL')}</div>
            <div class="stock-badge ${tieneStock ? '' : 'sin-stock'}">
                ${tieneStock ? `Stock: ${prod.stock} unid.` : '❌ AGOTADO'}
            </div>
            <button class="btn-cotizar-prod" ${tieneStock ? '' : 'disabled'} onclick="verDetalle('${prod.sku}')">
                ${tieneStock ? 'Ver Detalle' : 'Agotado'}
            </button>
        `;
        grid.appendChild(div);
    });
    aplicarFiltros();
}

function renderizarTablaAdmin() {
    adminDashboard.render(inventario);
}

// Fichas técnicas oficiales para componentes individuales (los kits se mantienen sin cambios para sus manuales)
const FICHAS_TECNICAS = {
    'ESP32-01': [
        { parametro: 'Microprocesador', valor: 'Tensilica Xtensa Dual-Core 32-bit LX6 @ 240 MHz' },
        { parametro: 'Tensión de Alimentación', valor: '5V DC (Micro-USB) / 3.3V DC (Pines VCC)' },
        { parametro: 'Conectividad Inalámbrica', valor: 'WiFi 802.11 b/g/n (hasta 150 Mbps) + Bluetooth v4.2 BR/EDR y BLE' },
        { parametro: 'Memoria SRAM / Flash', valor: '520 KB SRAM interna / 4 MB SPI Flash externa' },
        { parametro: 'GPIO Disponibles', valor: '30 pines multifunción (PWM, ADC 12 bits, DAC, I2C, SPI, UART)' },
        { parametro: 'Consumo Operacional', valor: '80 mA normal / 240 mA transmisión pico WiFi / 15 µA Deep Sleep' },
        { parametro: 'Temperatura de Trabajo', valor: '-40 °C a +85 °C' },
        { parametro: 'Protocolo de Integración', valor: 'MQTT / WebSockets / HTTPS para Sentinelacces Cloud' }
    ],
    'FPM10A-01': [
        { parametro: 'Sensor Óptico', valor: 'Prisma de alta precisión con iluminación LED azul' },
        { parametro: 'Voltaje de Trabajo', valor: '3.6V a 6.0V DC (Recomendado 5.0V DC)' },
        { parametro: 'Corriente de Trabajo', valor: '< 120 mA (Corriente pico: 140 mA)' },
        { parametro: 'Interfaz de Comunicación', valor: 'UART TTL estándar (Baudrate predeterminado 57600 bps)' },
        { parametro: 'Capacidad de Almacenamiento', valor: '1.000 huellas dactilares biométricas' },
        { parametro: 'Tiempo de Captura / Verificación', valor: '< 0.2 seg ingreso / < 0.8 seg verificación 1:N' },
        { parametro: 'Tasa de Falso Rechazo (FRR)', valor: '< 1.0% (Nivel de seguridad 3)' },
        { parametro: 'Tasa de Falsa Aceptación (FAR)', valor: '< 0.001% (Nivel de seguridad 3)' },
        { parametro: 'Área de Escaneo', valor: '14 x 18 mm (Resolución 500 DPI)' }
    ],
    'KEY-3X4': [
        { parametro: 'Formato Matriz', valor: '3 Columnas x 4 Filas (12 teclas: 0-9, *, #)' },
        { parametro: 'Tensión Máxima Soportada', valor: '35V DC, 100 mA máx' },
        { parametro: 'Resistencia de Contacto', valor: '10 a 500 Ohms' },
        { parametro: 'Resistencia de Aislamiento', valor: '≥ 100M Ohms a 100V DC' },
        { parametro: 'Tiempo de Rebote', valor: '≤ 5 ms' },
        { parametro: 'Vida Útil Mecánica', valor: 'Más de 1.000.000 de accionamientos por tecla' },
        { parametro: 'Conector de Salida', valor: 'Header plano hembra estándar 8 pines (paso 2.54 mm)' },
        { parametro: 'Instalación y Montaje', valor: 'Superficie posterior autoadhesiva 3M grado industrial' }
    ],
    'LCD-1602': [
        { parametro: 'Formato de Pantalla', valor: '16 caracteres por fila x 2 líneas alfanuméricas' },
        { parametro: 'Controlador y Módulo', valor: 'Controlador HD44780 con tarjeta I2C PCF8574 preinstalada' },
        { parametro: 'Tensión de Operación', valor: '5.0V DC' },
        { parametro: 'Interfaz de Control', valor: 'Bus I2C bidireccional (Dirección 0x27 / 0x3F)' },
        { parametro: 'Líneas de Conexión', valor: '4 pines: VCC, GND, SDA, SCL' },
        { parametro: 'Retroiluminación / Contraste', valor: 'Luz LED azul con potenciómetro para ajuste de contraste' },
        { parametro: 'Consumo Eléctrico', valor: '~20 mA con retroiluminación activa' },
        { parametro: 'Dimensiones del Módulo', valor: '80 mm x 36 mm x 12 mm' }
    ]
};

function obtenerFichaGenericaComponente(prod) {
    return [
        { parametro: 'Modelo / Referencia', valor: prod.modelo || prod.sku || 'Estándar Sentinelacces' },
        { parametro: 'Categoría de Hardware', valor: prod.categoria ? prod.categoria.toUpperCase() : 'Módulo de Control de Acceso' },
        { parametro: 'Tensión de Alimentación', valor: '5V - 12V DC Industrial' },
        { parametro: 'Protocolo de Interconexión', valor: 'GPIO / I2C / UART / Contacto Seco NO-NC' },
        { parametro: 'Compatibilidad', valor: 'Controladores ESP32 y Sistemas Sentinelacces' },
        { parametro: 'Garantía y Calibración', valor: 'Control de calidad en laboratorio, 12 meses de garantía oficial' }
    ];
}

// Menú de Tres Puntos (Barra Superior)
window.toggleMenuPuntos = function(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('dropdown-tres-puntos');
    const btn = document.getElementById('btn-menu-puntos');
    if (dropdown) dropdown.classList.toggle('abierto');
    if (btn) btn.classList.toggle('activo');
};

window.cerrarMenuPuntos = function() {
    const dropdown = document.getElementById('dropdown-tres-puntos');
    const btn = document.getElementById('btn-menu-puntos');
    if (dropdown) dropdown.classList.remove('abierto');
    if (btn) btn.classList.remove('activo');
};

document.addEventListener('click', (e) => {
    const wrapper = document.querySelector('.menu-puntos-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        window.cerrarMenuPuntos();
    }
    const searchBar = document.querySelector('.search-bar');
    if (searchBar && !searchBar.contains(e.target)) {
        const container = document.getElementById('sugerencias-container');
        if (container) container.style.display = 'none';
    }
});

// Perfil de Usuario
window.guardarPerfilUsuario = async function(e) {
    if (e) e.preventDefault();
    if (!usuarioActual) {
        mostrarNotificacion('Debes iniciar sesión para editar tu perfil', 'error');
        return;
    }
    const nombre = document.getElementById('perfil-nombre').value.trim();
    const telefono = document.getElementById('perfil-telefono').value.trim();
    const direccion = document.getElementById('perfil-direccion').value.trim();
    const region = document.getElementById('perfil-region').value.trim();
    const comuna = document.getElementById('perfil-comuna').value.trim();

    if (!nombre) {
        mostrarNotificacion('El nombre no puede estar vacío', 'error');
        return;
    }

    try {
        await updateDoc(doc(db, "usuarios", usuarioActual.uid), {
            nombre,
            telefono,
            direccion,
            region,
            comuna
        });

        if (document.getElementById('chk-nombre')) document.getElementById('chk-nombre').value = nombre;
        if (document.getElementById('chk-telefono')) document.getElementById('chk-telefono').value = telefono;
        if (document.getElementById('chk-calle')) document.getElementById('chk-calle').value = direccion;
        if (document.getElementById('chk-region')) document.getElementById('chk-region').value = region;
        if (document.getElementById('chk-comuna')) document.getElementById('chk-comuna').value = comuna;

        document.getElementById('perfil-nombre-tit').innerText = nombre;
        if (document.getElementById('perfil-avatar')) {
            document.getElementById('perfil-avatar').innerText = nombre.charAt(0).toUpperCase() || '👤';
        }
        mostrarNotificacion('¡Perfil de usuario actualizado con éxito!', 'exito');
    } catch(err) {
        console.error("Error al actualizar perfil:", err);
        mostrarNotificacion('Error al guardar datos del perfil', 'error');
    }
};

async function cargarDatosPerfilVista() {
    if (!usuarioActual) return;
    try {
        const docSnap = await getDoc(doc(db, "usuarios", usuarioActual.uid));
        const data = docSnap.exists() ? docSnap.data() : {};
        const nombre = data.nombre || usuarioActual.displayName || 'Usuario';
        const email = data.email || usuarioActual.email || '';
        const telefono = data.telefono || '';
        const direccion = data.direccion || '';
        const region = data.region || '';
        const comuna = data.comuna || '';
        const rol = data.rol === 'admin' ? 'Administrador' : 'Cliente';
        const fechaReg = data.fechaRegistro 
            ? new Date(data.fechaRegistro).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' }) 
            : 'Usuario Registrado';

        if (document.getElementById('perfil-nombre')) document.getElementById('perfil-nombre').value = nombre;
        if (document.getElementById('perfil-nombre-tit')) document.getElementById('perfil-nombre-tit').innerText = nombre;
        if (document.getElementById('perfil-email')) document.getElementById('perfil-email').value = email;
        if (document.getElementById('perfil-email-sub')) document.getElementById('perfil-email-sub').innerText = email;
        if (document.getElementById('perfil-telefono')) document.getElementById('perfil-telefono').value = telefono;
        if (document.getElementById('perfil-direccion')) document.getElementById('perfil-direccion').value = direccion;
        if (document.getElementById('perfil-region')) document.getElementById('perfil-region').value = region;
        if (document.getElementById('perfil-comuna')) document.getElementById('perfil-comuna').value = comuna;
        if (document.getElementById('perfil-rol-tag')) {
            document.getElementById('perfil-rol-tag').innerText = rol;
            document.getElementById('perfil-rol-tag').className = `perfil-rol-tag ${data.rol === 'admin' ? 'admin' : 'cliente'}`;
        }
        if (document.getElementById('perfil-fecha-registro')) document.getElementById('perfil-fecha-registro').innerText = fechaReg;
        if (document.getElementById('perfil-avatar')) {
            document.getElementById('perfil-avatar').innerText = nombre.charAt(0).toUpperCase() || '👤';
        }
    } catch(err) {
        console.error("Error cargando perfil:", err);
    }
}

window.cambiarVista = function(vistaDestino) {
    if (vistaDestino === 'admin') {
        if (!esUsuarioAdmin) {
            mostrarNotificacion('Acceso restringido solo para administradores autorizados', 'error');
            return;
        }
    }
    if (vistaDestino === 'perfil') {
        if (!usuarioActual) {
            mostrarNotificacion('Inicia sesión para acceder a tu perfil', 'error');
            abrirModalLogin();
            return;
        }
        cargarDatosPerfilVista();
    }

    adminDashboard.closeDrawer?.();
    window.cerrarMenuPuntos?.();

    document.querySelectorAll('.vista').forEach(v => v.classList.remove('activa'));
    if (document.getElementById(`vista-${vistaDestino}`)) {
        document.getElementById(`vista-${vistaDestino}`).classList.add('activa');
    }
    if (vistaDestino === 'carrito') renderizarCarrito();
    if (vistaDestino === 'checkout') renderizarCheckout();
    if (vistaDestino === 'admin') renderizarTablaAdmin();
    if (vistaDestino === 'perfil') cargarDatosPerfilVista();
    window.scrollTo(0, 0);
};

window.verDetalle = function(sku) {
    productoSeleccionado = inventario.find(p => p.sku === sku);
    if (!productoSeleccionado) return;

    document.getElementById('det-titulo').innerText = productoSeleccionado.nombre;
    document.getElementById('det-modelo').innerText = `SKU: ${productoSeleccionado.sku}`;
    document.getElementById('det-precio').innerText = `$${productoSeleccionado.precio.toLocaleString('es-CL')}`;
    document.getElementById('det-img').src = productoSeleccionado.imagenUrl || 'kit_basico.png';

    // Lógica para asignar descripciones debajo de la imagen
    const txtDesc = document.getElementById('det-desc-texto');
    if (productoSeleccionado.descripcion) {
        txtDesc.innerText = productoSeleccionado.descripcion;
    } else if (productoSeleccionado.kits && productoSeleccionado.kits.includes('basico')) {
        txtDesc.innerText = "Sistema de control e inventario de accesos. Solución integrada de respaldo lista para instalar en laboratorios y salas restringidas.";
    } else {
        txtDesc.innerText = "Componente oficial Sentinelacces probado y calibrado para sistemas de control de acceso de alta disponibilidad.";
    }

    // Distinción entre Kits y Componentes:
    // A los kits se les hará un manual, por lo tanto NO se modifican.
    // A cada componente se le coloca ficha técnica con especificaciones oficiales.
    const esKit = (productoSeleccionado.kits && productoSeleccionado.kits.length > 0 && !productoSeleccionado.categoria) ||
                  (productoSeleccionado.nombre && productoSeleccionado.nombre.toLowerCase().includes('kit')) ||
                  (productoSeleccionado.sku && productoSeleccionado.sku.toLowerCase().includes('kit')) ||
                  productoSeleccionado.tipo === 'kit';

    const fichaBox = document.getElementById('det-ficha-tecnica-container');
    const fichaTbody = document.getElementById('det-tabla-ficha-body');

    if (esKit) {
        // Kit: no se le agrega ficha técnica de componente para no alterar lo destinado a manuales
        if (fichaBox) fichaBox.style.display = 'none';
    } else {
        // Componente: mostrar Ficha Técnica con especificaciones
        if (fichaBox && fichaTbody) {
            fichaBox.style.display = 'block';
            const datosFicha = FICHAS_TECNICAS[productoSeleccionado.sku] || obtenerFichaGenericaComponente(productoSeleccionado);
            fichaTbody.innerHTML = datosFicha.map(f => `
                <tr>
                    <td class="ficha-param"><strong>${f.parametro}</strong></td>
                    <td class="ficha-val">${f.valor}</td>
                </tr>
            `).join('');
        }
    }

    const elStock = document.getElementById('det-stock');
    const btnAdd = document.getElementById('btn-add-det');

    if (productoSeleccionado.stock > 0) {
        elStock.innerText = `✔️ Stock disponible: ${productoSeleccionado.stock} unidades`;
        elStock.style.color = '#2f855a';
        btnAdd.disabled = false;
    } else {
        elStock.innerText = `❌ Producto Agotado`;
        elStock.style.color = '#c53030';
        btnAdd.disabled = true;
    }
    cantidadSeleccionada = 1;
    document.getElementById('cantidad-input').innerText = cantidadSeleccionada;
    cambiarVista('detalle');
};

window.cambiarCantidad = function(cambio) {
    if (!productoSeleccionado) return;
    cantidadSeleccionada += cambio;
    if (cantidadSeleccionada < 1) cantidadSeleccionada = 1;
    if (cantidadSeleccionada > productoSeleccionado.stock) {
        cantidadSeleccionada = productoSeleccionado.stock;
        mostrarNotificacion(`Límite disponible (${productoSeleccionado.stock})`, 'error');
    }
    document.getElementById('cantidad-input').innerText = cantidadSeleccionada;
};

window.ejecutarAgregarAlCarro = async function() {
    if (!productoSeleccionado || productoSeleccionado.stock <= 0) return;

    const index = carrito.findIndex(item => item.sku === productoSeleccionado.sku);
    if (index > -1) {
        if (carrito[index].cantidad + cantidadSeleccionada > productoSeleccionado.stock) {
            mostrarNotificacion('Superas el stock disponible', 'error');
            return;
        }
        carrito[index].cantidad += cantidadSeleccionada;
    } else {
        carrito.push({ ...productoSeleccionado, cantidad: cantidadSeleccionada });
    }

    try {
        if(productoSeleccionado.id) {
            const docRef = doc(db, "productos", productoSeleccionado.id);
            await updateDoc(docRef, { deseabilidad: increment(1) });
        }
    } catch(e) {
        console.log("Error deseabilidad:", e);
    }

    localStorage.setItem('fechaUltimaAdicion', Date.now().toString());
    localStorage.removeItem('bannerAbandonoCerrado');

    actualizarContadorHeader();
    verificarCondicionAbandonoMes();

    document.getElementById('modal-titulo').innerText = productoSeleccionado.nombre;
    document.getElementById('modal-sku').innerText = `SKU: ${productoSeleccionado.sku}`;
    document.getElementById('modal-precio').innerText = `$${productoSeleccionado.precio.toLocaleString('es-CL')}`;
    document.getElementById('modal-img').src = productoSeleccionado.imagenUrl || 'kit_basico.png';
    document.getElementById('modal-agregado').classList.add('activa');
};

window.cerrarModal = function() { document.getElementById('modal-agregado').classList.remove('activa'); };

function actualizarContadorHeader() {
    const totalCant = carrito.reduce((acc, item) => acc + item.cantidad, 0);
    const badge = document.getElementById('cart-count-header');
    if(badge) badge.innerText = totalCant;

    if (totalCant === 0) {
        document.getElementById('banner-carrito-pendiente').style.display = 'none';
        localStorage.removeItem('fechaUltimaAdicion');
    }
}

function verificarCondicionAbandonoMes() {
    const banner = document.getElementById('banner-carrito-pendiente');
    const estaCerradoManualmente = localStorage.getItem('bannerAbandonoCerrado') === 'true';

    if (carrito.length === 0 || estaCerradoManualmente) {
        banner.style.display = 'none';
        return;
    }

    const fechaGuardada = localStorage.getItem('fechaUltimaAdicion');
    if (fechaGuardada) {
        const msUnMes = 30 * 24 * 60 * 60 * 1000;
        const tiempoTranscurrido = Date.now() - parseInt(fechaGuardada);

        if (tiempoTranscurrido >= msUnMes) {
            const ultimoItem = carrito[carrito.length - 1];
            const bannerInfo = document.getElementById('banner-prod-info');
            bannerInfo.innerHTML = `
                <img src="${ultimoItem.imagenUrl || 'kit_basico.png'}" alt="${ultimoItem.nombre}">
                <div>
                    <div style="font-size:0.8rem; font-weight:bold; color:#63b3ed;">${ultimoItem.nombre}</div>
                    <div style="font-size:0.85rem;">Cant: ${ultimoItem.cantidad} — <span style="text-decoration:line-through; color:#cbd5e0;">$${(ultimoItem.precio * ultimoItem.cantidad).toLocaleString('es-CL')}</span> <strong style="color:#48bb78;">$${Math.round((ultimoItem.precio * ultimoItem.cantidad) * 0.95).toLocaleString('es-CL')} (-5%)</strong></div>
                </div>
            `;
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
    }
}

window.cerrarBannerAbandono = function() {
    document.getElementById('banner-carrito-pendiente').style.display = 'none';
    localStorage.setItem('bannerAbandonoCerrado', 'true');
};

function renderizarCarrito() {
    const contenedor = document.getElementById('contenedor-items-carrito');
    const titCant = document.getElementById('carrito-cant-tit');
    contenedor.innerHTML = '';
    const totalItems = carrito.reduce((acc, i) => acc + i.cantidad, 0);
    titCant.innerText = totalItems;
    let subtotal = 0;

    carrito.forEach((item, index) => {
        subtotal += item.precio * item.cantidad;
        const div = document.createElement('div');
        div.className = 'item-carrito-card';
        div.innerHTML = `
            <img src="${item.imagenUrl || 'kit_basico.png'}" alt="${item.nombre}">
            <div class="item-carrito-info">
                <h4>${item.nombre}</h4>
                <div class="item-carrito-sku">SKU: ${item.sku}</div>
                <div class="item-carrito-cant-precio">
                    <span>Cantidad: <strong>${item.cantidad}</strong></span>
                    <span>Precio: <strong>$${item.precio.toLocaleString('es-CL')}</strong></span>
                </div>
            </div>
            <button style="border:none; background:none; cursor:pointer; font-size:1.2rem;" onclick="eliminarItem(${index})">🗑️</button>
        `;
        contenedor.appendChild(div);
    });

    const descuento = Math.round(subtotal * 0.05);
    const subtotalConDcto = subtotal - descuento;
    const iva = Math.round(subtotalConDcto * 0.19);
    const total = subtotalConDcto + iva;

    document.getElementById('cart-subtotal').innerText = `$${subtotal.toLocaleString('es-CL')}`;
    document.getElementById('cart-dcto').innerText = `-$${descuento.toLocaleString('es-CL')}`;
    document.getElementById('cart-iva').innerText = `$${iva.toLocaleString('es-CL')}`;
    document.getElementById('cart-total').innerText = `$${total.toLocaleString('es-CL')}`;
}

window.eliminarItem = function(index) { carrito.splice(index, 1); actualizarContadorHeader(); renderizarCarrito(); };

window.vaciarCarritoConAbandono = async function() {
    if(carrito.length > 0) {
        for(let item of carrito) {
            try {
                if(item.id) {
                    const docRef = doc(db, "productos", item.id);
                    await updateDoc(docRef, { abandonosCarro: increment(item.cantidad) });
                }
            } catch(e) {
                console.log("Error abandono:", e);
            }
        }
    }
    carrito = [];
    actualizarContadorHeader();
    renderizarCarrito();
    document.getElementById('banner-carrito-pendiente').style.display = 'none';
    mostrarNotificacion('Carrito vaciado y registrado en analíticas', 'error');
};

window.vaciarCarrito = function() {
    carrito = [];
    actualizarContadorHeader();
    renderizarCarrito();
    document.getElementById('banner-carrito-pendiente').style.display = 'none';
};

function renderizarCheckout() {
    const box = document.getElementById('checkout-prod-list');
    box.innerHTML = '';
    let subtotal = 0;
    carrito.forEach(item => {
        subtotal += item.precio * item.cantidad;
        const p = document.createElement('div');
        p.style.fontSize = '0.88rem';
        p.style.marginBottom = '0.5rem';
        p.innerHTML = `<strong>${item.nombre}</strong><br><span style="color:#718096;">Cant: ${item.cantidad} — $${(item.precio * item.cantidad).toLocaleString('es-CL')}</span>`;
        box.appendChild(p);
    });

    const descuento = Math.round(subtotal * 0.05);
    const subtotalConDcto = subtotal - descuento;
    const iva = Math.round(subtotalConDcto * 0.19);
    const total = subtotalConDcto + iva;

    document.getElementById('chk-subtotal').innerText = `$${subtotal.toLocaleString('es-CL')}`;
    document.getElementById('chk-dcto').innerText = `- $${descuento.toLocaleString('es-CL')}`;
    document.getElementById('chk-iva').innerText = `+ $${iva.toLocaleString('es-CL')}`;
    document.getElementById('chk-total').innerText = `$${total.toLocaleString('es-CL')}`;
}

window.seleccionarCuenta = function(crear) {
    crearCuentaActivo = crear;
    if (crear) {
        document.getElementById('opt-si').classList.add('selected');
        document.getElementById('opt-no').classList.remove('selected');
        document.getElementById('grupo-password').style.display = 'block';
    } else {
        document.getElementById('opt-no').classList.add('selected');
        document.getElementById('opt-si').classList.remove('selected');
        document.getElementById('grupo-password').style.display = 'none';
    }
};

function limpiarFormularioCheckout() {
    if (!usuarioActual) {
        document.getElementById('chk-nombre').value = '';
        document.getElementById('chk-email').value = '';
        document.getElementById('chk-telefono').value = '';
        document.getElementById('chk-calle').value = '';
        document.getElementById('chk-depto').value = '';
        document.getElementById('chk-region').value = '';
        document.getElementById('chk-comuna').value = '';
        document.getElementById('chk-password').value = '';
    }
    vaciarCarrito();
}

async function descontarInventarioYRegistrarVentas() {
    for (let item of carrito) {
        const prod = inventario.find(p => p.sku === item.sku);
        if (prod) prod.stock -= item.cantidad;

        try {
            if(item.id) {
                const docRef = doc(db, "productos", item.id);
                await updateDoc(docRef, { 
                    stock: increment(-item.cantidad),
                    ventasMes: increment(item.cantidad)
                });
            }
        } catch(e) {
            console.log("Error ventas/stock:", e);
        }
    }
    cargarInventarioFirestore();
}

window.procesarRegistroFirebase = async function() {
    if (carrito.length === 0) { mostrarNotificacion('El carrito está vacío', 'error'); return; }

    const nombre = document.getElementById('chk-nombre').value.trim();
    const email = document.getElementById('chk-email').value.trim();
    const telefono = document.getElementById('chk-telefono').value.trim();
    const calle = document.getElementById('chk-calle').value.trim();
    const region = document.getElementById('chk-region').value;
    const comuna = document.getElementById('chk-comuna').value;
    const password = document.getElementById('chk-password').value;

    if (!nombre || !email || !telefono || !calle) {
        mostrarNotificacion('Completa los campos obligatorios (*)', 'error');
        return;
    }

    try {
        if (usuarioActual) {
            await descontarInventarioYRegistrarVentas();
            mostrarNotificacion('¡Compra procesada con éxito!', 'exito');
            setTimeout(() => { limpiarFormularioCheckout(); cambiarVista('inicio'); }, 2200);
        } else if (crearCuentaActivo) {
            if (!password || password.length < 6) {
                mostrarNotificacion('Contraseña mínimo de 6 caracteres', 'error');
                return;
            }
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, "usuarios", userCredential.user.uid), {
                nombre, email, telefono, direccion: calle, region, comuna, rol: 'cliente', fechaRegistro: new Date().toISOString()
            });
            await descontarInventarioYRegistrarVentas();
            mostrarNotificacion('¡Cuenta creada y compra exitosa!', 'exito');
            setTimeout(() => { limpiarFormularioCheckout(); cambiarVista('inicio'); }, 2200);
        } else {
            await descontarInventarioYRegistrarVentas();
            mostrarNotificacion('¡Compra como invitado exitosa!', 'exito');
            setTimeout(() => { limpiarFormularioCheckout(); cambiarVista('inicio'); }, 2200);
        }
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            mostrarNotificacion('El correo ya está registrado. Inicia sesión arriba.', 'error');
        } else {
            mostrarNotificacion('Error: ' + error.message, 'error');
        }
    }
};

window.mostrarTodos = function() { document.querySelectorAll('.filtros-sidebar input').forEach(c => c.checked = false); aplicarFiltros(); };

window.seleccionarKit = function(kit) { 
    document.querySelectorAll('.filtros-sidebar input').forEach(c => {
        c.checked = (c.value === kit);
    }); 
    aplicarFiltros(); 
};

window.aplicarFiltros = function() {
    const checksKits = Array.from(document.querySelectorAll('.filtro-chk[value="basico"], .filtro-chk[value="intermedio"], .filtro-chk[value="avanzado"]')).filter(c => c.checked).map(c => c.value);
    const checksComp = Array.from(document.querySelectorAll('.filtro-chk:not([value="basico"]):not([value="intermedio"]):not([value="avanzado"])')).filter(c => c.checked).map(c => c.value);

    let visibles = 0;
    document.querySelectorAll('.prod-item').forEach(prod => {
        const kitsProd = (prod.getAttribute('data-kits') || '').split(' ');
        const compProd = prod.getAttribute('data-comp') || '';

        let pasaKit = (checksKits.length === 0) || checksKits.some(k => kitsProd.includes(k));
        let pasaComp = (checksComp.length === 0) || checksComp.includes(compProd);

        if (pasaKit && pasaComp) { prod.style.display = 'flex'; visibles++; }
        else { prod.style.display = 'none'; }
    });
    document.getElementById('contador-productos').innerText = `${visibles} componente(s) disponible(s)`;
};

cargarInventarioFirestore();
verificarCondicionAbandonoMes();
