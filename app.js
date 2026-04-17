/* ============================================================
   CRM CASA MATRIZ - app.js
   ============================================================ */

// ─── STATE ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCV-FgxmVkfGmXsPI64zGjauPOqwTXF_ms",
  authDomain: "crm-casa-matriz-aramis-rosado.firebaseapp.com",
  databaseURL: "https://crm-casa-matriz-aramis-rosado-default-rtdb.firebaseio.com",
  projectId: "crm-casa-matriz-aramis-rosado",
  storageBucket: "crm-casa-matriz-aramis-rosado.firebasestorage.app",
  messagingSenderId: "243641945848",
  appId: "1:243641945848:web:c5fff1b2436df2a3b3b50d"
};
firebase.initializeApp(firebaseConfig);
const RDB = firebase.database();
const AUTH = firebase.auth();
const STO = firebase.storage();

let db = { productos: [], vendedores: [], clientes: [], ventas: [], leads: [], recordatorios: [], tareas: [] };
let currentCart = [];
let isFirstLoad = true;
let unsubscribeData = null;
let currentRol = 'gerente';

AUTH.onAuthStateChanged(user => {
  if (user) {
    RDB.ref('users/' + user.uid).get().then(snap => {
      const udata = snap.val() || { rol: 'gerente' };
      currentRol = udata.rol || 'gerente';
      document.body.className = 'role-' + currentRol;
      
      document.getElementById('login-overlay').style.display = 'none';
      
      // Navigate Almacen directly to inventario
      if (currentRol === 'almacen' && document.querySelector('.page.active').id === 'page-dashboard') {
        navigateTo('inventario');
      }

      // Start listening to real-time data only if authenticated
    unsubscribeData = RDB.ref('/').on('value', snap => {
      const data = snap.val() || {};
      db.productos = data.productos ? Object.values(data.productos) : [];
      db.vendedores = data.vendedores ? Object.values(data.vendedores) : [];
      db.clientes = data.clientes ? Object.values(data.clientes) : [];
      db.ventas = data.ventas ? Object.values(data.ventas) : [];
      db.leads = data.leads ? Object.values(data.leads) : [];
      db.recordatorios = data.recordatorios ? Object.values(data.recordatorios) : [];
      db.tareas = data.tareas ? Object.values(data.tareas) : [];

      if (isFirstLoad) {
        init();
        isFirstLoad = false;
      } else {
        const activePage = document.querySelector('.page.active');
        if (activePage) navigateTo(activePage.id.replace('page-', ''));
        updateReminderBadge();
      }
    });
    }); // Closes .then(snap => {
  } else {
    // User is logged out
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('auth-pass').value = '';
    
    // Clean memory and detach listener
    if (unsubscribeData) {
      RDB.ref('/').off('value', unsubscribeData);
      unsubscribeData = null;
    }
    db = { productos: [], vendedores: [], clientes: [], ventas: [], leads: [], recordatorios: [], tareas: [] };
  }
});

// ─── AUTHENTICATION ───────────────────────────────────────────
function login() {
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-pass').value;
  if (!email || !pass) return showAuthError('Ingresa correo y contraseña');
  
  AUTH.signInWithEmailAndPassword(email, pass)
    .catch(err => showAuthError(err.message));
}

function register() {
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-pass').value;
  if (!email || !pass) return showAuthError('Ingresa correo y contraseña');
  
  AUTH.createUserWithEmailAndPassword(email, pass)
    .then(cred => {
      const rol = document.getElementById('auth-rol').value;
      RDB.ref('users/' + cred.user.uid).set({ email, rol });
    })
    .catch(err => showAuthError(err.message));
}

function logout() {
  AUTH.signOut();
}

function showAuthError(msg) {
  document.getElementById('auth-error').textContent = msg.replace('Firebase:', '').trim();
  setTimeout(() => document.getElementById('auth-error').textContent = '', 4000);
}

function restaurarPassword() {
  const email = document.getElementById('auth-email').value.trim();
  if (!email) {
    showAuthError('Ingresa tu correo para enviarte el enlace');
    return;
  }
  
  AUTH.sendPasswordResetEmail(email)
    .then(() => {
      showToast('📩 Correo de restauración enviado. Revisa tu bandeja de entrada.');
    })
    .catch(err => {
      showAuthError('Error: ' + err.message);
    });
}

// ─── HELPERS ──────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function formatCurrency(n) {
  if (n === null || n === undefined || isNaN(n)) return '$ 0.00';
  return '$ ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T12:00:00');
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 3500);
}

function generateWALink(telefono, mensaje) {
  const clean = telefono.replace(/\D/g, '');
  const msg = encodeURIComponent(mensaje);
  return `https://wa.me/${clean}?text=${msg}`;
}

function getUnidades() {
  const units = new Set();
  // Unidades por defecto por si el DB está vacío
  ['Consumibles', 'Línea Hogar', 'Maquinaria'].forEach(u => units.add(u));
  db.productos.forEach(p => { if (p.unidad) units.add(p.unidad); });
  db.ventas.forEach(v => { if (v.unidad) units.add(v.unidad); });
  return Array.from(units).sort();
}

function getUnitColor(unidad) {
  const map = {
    'Consumibles': 'var(--consumibles)',
    'Línea Hogar': 'var(--hogar)',
    'Maquinaria': 'var(--maquinaria)'
  };
  if (map[unidad]) return map[unidad];
  
  // Generar un color basado en el nombre de la unidad para unidades nuevas
  let hash = 0;
  for (let i = 0; i < unidad.length; i++) {
    hash = unidad.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 70%, 45%)`;
}

function populateUnitSelects() {
  const unidades = getUnidades();
  const selectIds = [
    'ventas-filter-unidad', 'cat-filter-unidad', 'inv-filter-unidad', 
    'an-filter-unidad', 'v-unidad', 'p-unidad', 'l-unidad'
  ];

  selectIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const currentVal = el.value;
    
    // Mantener la primera opción si es de "Todos" o "Seleccionar"
    const firstOption = el.options[0] ? el.options[0].outerHTML : '';
    el.innerHTML = firstOption;
    
    unidades.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u;
      opt.textContent = u;
      el.appendChild(opt);
    });
    
    if (currentVal) el.value = currentVal;
  });

  // Actualizar Sidebar badges
  const sidebarBadges = document.querySelector('.unit-badges');
  if (sidebarBadges) {
    sidebarBadges.innerHTML = unidades.map(u => {
      const short = u.slice(0, 3).toUpperCase();
      return `<span class="unit-badge" style="background:${getUnitColor(u)}22; color:${getUnitColor(u)}">${short}</span>`;
    }).join('');
  }
  const sidebarText = document.querySelector('.sidebar-footer-text');
  if (sidebarText) {
    sidebarText.textContent = `${unidades.length} Unidades de Negocio`;
  }
}

// ─── NAVIGATION ───────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: '📊 Dashboard',
  ventas: '💰 Ventas',
  leads: '🎯 Leads & Pipeline',
  recordatorios: '🔔 Recordatorios',
  catalogo: '📦 Catálogo',
  vendedores: '👥 Vendedores',
  clientes: '🤝 Clientes',
  analitica: '📈 Analítica Gerencial',
  inventario: '📦 Inventario / Stock',
};

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page] || page;
  closeSidebar();

  const renders = {
    dashboard: renderDashboard,
    ventas: renderVentas,
    leads: renderLeads,
    recordatorios: renderRecordatorios,
    catalogo: renderCatalogo,
    vendedores: renderVendedores,
    clientes: renderClientes,
    analitica: renderAnalitica,
    inventario: renderInventario,
    tareas: renderTareas,
  };
  if (renders[page]) renders[page]();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

// ─── MODALS ───────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('.modal-backdrop').forEach(m => {
  m.addEventListener('click', (e) => {
    if (e.target === m) closeModal(m.id);
  });
});

// ─── POPULATE SELECTS ─────────────────────────────────────────
function populateSelects() {
  populateUnitSelects();
  // Vendedores selects
  ['v-vendedor', 'l-vendedor', 'ventas-filter-vendedor'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    el.innerHTML = id === 'ventas-filter-vendedor'
      ? '<option value="">Todos los vendedores</option>'
      : '<option value="">-- Seleccionar --</option>';
    db.vendedores.forEach(v => {
      el.innerHTML += `<option value="${v.id}">${v.nombre}</option>`;
    });
    if (val) el.value = val;
  });

  // Clientes select
  const vcli = document.getElementById('v-cliente');
  if (vcli) {
    const val = vcli.value;
    vcli.innerHTML = '<option value="">-- Seleccionar --</option>';
    db.clientes.forEach(c => {
      vcli.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
    });
    if (val) vcli.value = val;
  }

  // Tareas: Leads/Clientes select
  const tvin = document.getElementById('tar-vinculo');
  if (tvin) {
    const val = tvin.value;
    tvin.innerHTML = '<option value="">Ninguno</option>';
    db.leads.forEach(l => {
      tvin.innerHTML += `<option value="lead:${l.id}">Lead: ${l.nombre}</option>`;
    });
    db.clientes.forEach(c => {
      tvin.innerHTML += `<option value="cliente:${c.id}">Cliente: ${c.nombre}</option>`;
    });
    if (val) tvin.value = val;
  }

  // Tareas: Vendedores select
  const tvend = document.getElementById('tar-vendedor');
  if (tvend) {
    const val = tvend.value;
    tvend.innerHTML = '<option value="">-- Seleccionar --</option>';
    db.vendedores.forEach(v => {
      tvend.innerHTML += `<option value="${v.id}">${v.nombre}</option>`;
    });
    if (val) tvend.value = val;
  }
}

// ─── VENTAS MODULE ────────────────────────────────────────────
function resetVentaForm() {
  document.getElementById('v-id').value = '';
  document.getElementById('v-fecha').value = todayStr();
  document.getElementById('v-vendedor').value = '';
  document.getElementById('v-cliente').value = '';
  document.getElementById('v-unidad').value = '';
  document.getElementById('v-producto').innerHTML = '<option value="">-- Seleccionar --</option>';
  document.getElementById('v-precio-base').value = '';
  document.getElementById('v-descuento').value = '0';
  document.getElementById('v-precio-final').value = '';
  document.getElementById('v-cantidad').value = '1';
  document.getElementById('v-fuente').value = 'Directo';
  document.getElementById('v-justificacion').value = '';
  document.getElementById('v-notas').value = '';
  document.getElementById('v-alerta-descuento').classList.add('hidden');
  document.getElementById('v-justificacion-group').style.display = 'none';
  document.getElementById('modal-venta-title').textContent = '💰 Nueva Venta';
  updatePriceSummary(0, 0, 0, 1);
  populateSelects();
}

function filterProductosByUnidad() {
  const unidad = document.getElementById('v-unidad').value;
  const sel = document.getElementById('v-producto');
  sel.innerHTML = '<option value="">-- Seleccionar --</option>';
  db.productos
    .filter(p => !unidad || p.unidad === unidad)
    .forEach(p => {
      sel.innerHTML += `<option value="${p.id}">${p.nombre} — ${formatCurrency(p.precio)}</option>`;
    });
  document.getElementById('v-precio-base').value = '';
  document.getElementById('v-descuento').value = '0';
  calcularPrecio();
}

function onProductoChange() {
  const pid = document.getElementById('v-producto').value;
  const prod = db.productos.find(p => p.id === pid);
  if (!prod) {
    document.getElementById('v-precio-base').value = '';
    calcularPrecio();
    return;
  }
  document.getElementById('v-precio-base').value = prod.precio;
  // Set unidad if not set
  if (!document.getElementById('v-unidad').value) {
    document.getElementById('v-unidad').value = prod.unidad;
  }
  calcularPrecio();
}

function addItemToCart() {
  const pid = document.getElementById('v-producto').value;
  const prod = db.productos.find(p => p.id === pid);
  const qty = parseInt(document.getElementById('v-cantidad').value) || 1;
  const rawPrice = parseFloat(document.getElementById('v-precio-base').value) || 0;

  if (!prod) return showToast('Selecciona un producto', 'warning');
  if (qty < 1) return showToast('Cantidad inválida', 'warning');
  if (rawPrice <= 0) return showToast('Indica un precio válido', 'warning');

  // Validar stock disponible
  const currentQtyInCart = currentCart.filter(i => i.productoId === prod.id).reduce((sum, i) => sum + i.cantidad, 0);
  if ((prod.stock || 0) < (qty + currentQtyInCart)) {
    return showToast(`⚠️ Stock insuficiente. Disponible: ${prod.stock || 0}`, 'danger');
  }

  currentCart.push({
    id: uid(),
    productoId: prod.id,
    nombre: prod.nombre,
    unidad: prod.unidad,
    precioUn: rawPrice,
    cantidad: qty,
    total: rawPrice * qty
  });

  renderCart();
  // Reset item selection
  document.getElementById('v-producto').value = '';
  document.getElementById('v-precio-base').value = '';
  document.getElementById('v-cantidad').value = '1';
}

function renderCart() {
  const tbody = document.getElementById('v-cart-body');
  tbody.innerHTML = currentCart.map((item, index) => `
    <tr>
      <td>${item.nombre}</td>
      <td>${item.unidad}</td>
      <td>${formatCurrency(item.precioUn)}</td>
      <td>${item.cantidad}</td>
      <td><strong>${formatCurrency(item.total)}</strong></td>
      <td><button class="btn-ghost" onclick="removeItemFromCart(${index})">✕</button></td>
    </tr>
  `).join('');
  calcularTotalesCart();
}

function removeItemFromCart(index) {
  currentCart.splice(index, 1);
  renderCart();
}

function calcularTotalesCart() {
  const subtotal = currentCart.reduce((sum, item) => sum + item.total, 0);
  const pctGlobal = parseFloat(document.getElementById('v-descuento').value) || 0;
  const descAmt = subtotal * (pctGlobal / 100);
  const total = subtotal - descAmt;

  document.getElementById('sum-base').textContent = formatCurrency(subtotal);
  document.getElementById('sum-pct').textContent = pctGlobal;
  document.getElementById('sum-desc').textContent = '- ' + formatCurrency(descAmt);
  document.getElementById('sum-qty').textContent = currentCart.reduce((sum, item) => sum + item.cantidad, 0);
  document.getElementById('sum-total').textContent = formatCurrency(total);

  // Alerta de descuento para el gerente (si el descuento global es alto)
  const alertEl = document.getElementById('v-alerta-descuento');
  const justGroup = document.getElementById('v-justificacion-group');
  if (pctGlobal > 20) {
    alertEl.classList.remove('hidden');
    justGroup.style.display = 'block';
  } else {
    alertEl.classList.add('hidden');
    justGroup.style.display = pctGlobal > 0 ? 'block' : 'none';
  }
}

function resetVentaForm() {
  currentCart = [];
  document.getElementById('v-id').value = '';
  document.getElementById('v-fecha').value = todayStr();
  document.getElementById('v-vendedor').value = '';
  document.getElementById('v-cliente').value = '';
  document.getElementById('v-unidad').value = '';
  document.getElementById('v-fuente').value = 'Directo';
  document.getElementById('v-descuento').value = '0';
  document.getElementById('v-justificacion').value = '';
  document.getElementById('v-notas').value = '';
  document.getElementById('modal-venta-title').textContent = '💰 Nueva Venta';
  renderCart();
}

function guardarVenta() {
  const vendedorId = document.getElementById('v-vendedor').value;
  const clienteId = document.getElementById('v-cliente').value;
  const fecha = document.getElementById('v-fecha').value;
  const unidad = document.getElementById('v-unidad').value;
  const pctGlobal = parseFloat(document.getElementById('v-descuento').value) || 0;
  const justificacion = document.getElementById('v-justificacion').value.trim();

  if (!fecha || !vendedorId || !clienteId || !unidad) {
    return showToast('Completa los campos obligatorios.', 'error');
  }
  if (!currentCart.length) {
    return showToast('Debes añadir al menos un producto.', 'warning');
  }
  if (pctGlobal > 20 && !justificacion) {
    return showToast('Se requiere justificación para descuentos elevados.', 'error');
  }

  const vendedor = db.vendedores.find(v => v.id === vendedorId);
  const cliente = db.clientes.find(c => c.id === clienteId);
  
  const subtotal = currentCart.reduce((sum, item) => sum + item.total, 0);
  const totalDesc = subtotal * (pctGlobal / 100);
  const totalFinal = subtotal - totalDesc;

  const existingId = document.getElementById('v-id').value;
  const venta = {
    id: existingId || uid(),
    fecha,
    vendedorId,
    vendedorNombre: vendedor ? vendedor.nombre : '—',
    clienteId,
    clienteNombre: cliente ? cliente.nombre : '—',
    clienteTel: cliente ? cliente.telefono : '',
    unidad,
    items: currentCart, // Nuevo: Soporte multiproducto
    subtotal: subtotal,
    descuentoPct: pctGlobal,
    descuentoAmt: totalDesc,
    total: totalFinal,
    fuente: document.getElementById('v-fuente').value,
    justificacion,
    notas: document.getElementById('v-notas').value.trim(),
    necAuth: pctGlobal > 20,
    authOk: false,
    createdAt: new Date().toISOString(),
  };

  // Validar stock final de CADA producto antes de guardar
  for (const item of currentCart) {
    const p = db.productos.find(prod => prod.id === item.productoId);
    if (!p || (p.stock || 0) < item.cantidad) {
      return showToast(`⚠️ Error: El producto "${item.nombre}" se quedó sin stock suficiente mientras editabas.`, 'danger');
    }
  }

  // Descontar stock de CADA producto
  currentCart.forEach(item => {
    const prodRef = RDB.ref('productos/' + item.productoId + '/stock');
    prodRef.get().then(snap => {
      const currentStock = snap.val() || 0;
      prodRef.set(currentStock - item.cantidad);
    });
  });

  // Generar recordatorio si hay consumibles
  const hasConsumibles = currentCart.some(i => i.unidad === 'Consumibles');
  if (!existingId && hasConsumibles) {
    const recId = uid();
    const prodNames = currentCart.filter(i => i.unidad === 'Consumibles').map(i => i.nombre).join(', ');
    RDB.ref('recordatorios/' + recId).set({
      id: recId,
      ventaId: venta.id,
      clienteNombre: venta.clienteNombre,
      clienteTel: venta.clienteTel,
      productoNombre: prodNames,
      fechaVenta: fecha,
      fechaRecordatorio: addDays(fecha, 25),
      estado: 'pendiente'
    });
  }

  RDB.ref('ventas/' + venta.id).set(venta).then(() => {
    closeModal('modal-venta');
    showToast(existingId ? '✅ Venta actualizada.' : '✅ Venta registrada correctamente.');
    resetVentaForm();
  });
}

function renderVentas() {
  populateSelects();
  const filterUnidad = document.getElementById('ventas-filter-unidad')?.value || '';
  const filterVend = document.getElementById('ventas-filter-vendedor')?.value || '';
  const search = (document.getElementById('ventas-search')?.value || '').toLowerCase();

  const tbody = document.getElementById('ventas-body');
  let ventas = [...db.ventas].reverse()
    .filter(v => (!filterUnidad || v.unidad === filterUnidad))
    .filter(v => (!filterVend || v.vendedorId === filterVend))
    .filter(v => !search || v.clienteNombre.toLowerCase().includes(search) || (v.items && v.items.some(i => i.nombre.toLowerCase().includes(search))) || (v.productoNombre && v.productoNombre.toLowerCase().includes(search)));

  if (!ventas.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="11">No hay ventas registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = ventas.map(v => {
    const authTag = v.necAuth
      ? (v.authOk ? '<span class="tag success">✅ Autorizada</span>' : '<span class="tag danger">⚠️ Pendiente Auth</span>')
      : '<span class="tag success">✔ OK</span>';

    // Manejo de productos (soporte para items nuevos y producto único legacy)
    let prodDisplay = '';
    if (v.items && v.items.length > 0) {
      prodDisplay = v.items.map(i => `<div style="margin-bottom:2px"><strong>${i.cantidad}x</strong> ${i.nombre}</div>`).join('');
    } else {
      prodDisplay = `<strong>1x</strong> ${v.productoNombre || '—'}`;
    }

    return `<tr>
      <td>${formatDate(v.fecha)}</td>
      <td><strong>${v.clienteNombre}</strong></td>
      <td style="font-size:11px; max-width:180px">${prodDisplay}</td>
      <td><span class="tag" style="background:${getUnitColor(v.unidad)}22; color:${getUnitColor(v.unidad)}">${v.unidad}</span></td>
      <td>${formatCurrency(v.subtotal || v.precioBase || 0)}</td>
      <td>${v.descuentoPct > 0 ? `<span class="tag ${v.descuentoPct > 20 ? 'danger' : 'warning'}">${v.descuentoPct}%</span>` : '—'}</td>
      <td><strong>${formatCurrency(v.total || 0)}</strong></td>
      <td class="text-danger">${v.descuentoAmt > 0 ? '- ' + formatCurrency(v.descuentoAmt) : '—'}</td>
      <td>${v.vendedorNombre}</td>
      <td>${authTag}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${v.necAuth && !v.authOk ? `<button class="btn-ghost" onclick="autorizarVenta('${v.id}')">Autorizar</button>` : ''}
          <button class="btn-danger btn-sm" onclick="eliminarVenta('${v.id}')">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function autorizarVenta(id) {
  RDB.ref('ventas/' + id + '/authOk').set(true)
    .then(() => showToast('✅ Venta autorizada.'));
}

function eliminarVenta(id) {
  if (!confirm('¿Eliminar esta venta?')) return;
  RDB.ref('ventas/' + id).remove()
    .then(() => showToast('Venta eliminada.', 'warning'));
}

function editarVenta(id) {
  const v = db.ventas.find(x => x.id === id);
  if (!v) return;
  resetVentaForm();
  document.getElementById('modal-venta-title').textContent = '✏️ Editar Venta';
  document.getElementById('v-id').value = v.id;
  document.getElementById('v-fecha').value = v.fecha;
  document.getElementById('v-vendedor').value = v.vendedorId;
  document.getElementById('v-cliente').value = v.clienteId;
  document.getElementById('v-unidad').value = v.unidad;
  filterProductosByUnidad();
  document.getElementById('v-producto').value = v.productoId;
  document.getElementById('v-precio-base').value = v.precioBase;
  document.getElementById('v-descuento').value = v.descuentoPct;
  document.getElementById('v-cantidad').value = v.cantidad;
  document.getElementById('v-fuente').value = v.fuente;
  document.getElementById('v-justificacion').value = v.justificacion;
  document.getElementById('v-notas').value = v.notas;
  calcularPrecio();
  openModal('modal-venta');
}

// ─── LEADS / PIPELINE ─────────────────────────────────────────
let draggedLeadId = null;

function renderLeads() {
  populateSelects();
  const stages = ['Prospecto', 'Cotización Enviada', 'Venta Perdida', 'Venta Cerrada', 'Post-venta'];
  const colIds = ['col-prospecto', 'col-cotizacion', 'col-perdida', 'col-cerrada', 'col-postventa'];
  const countIds = ['count-prospecto', 'count-cotizacion', 'count-perdida', 'count-cerrada', 'count-postventa'];

  stages.forEach((stage, i) => {
    const leads = db.leads.filter(l => l.etapa === stage);
    document.getElementById(countIds[i]).textContent = leads.length;
    const col = document.getElementById(colIds[i]);
    col.innerHTML = '';
    if (!leads.length) {
      col.innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:var(--text-muted)">Sin leads</div>';
      return;
    }
    leads.forEach(lead => {
      const card = document.createElement('div');
      card.className = 'lead-card';
      card.draggable = true;
      card.id = 'lead-' + lead.id;
      card.innerHTML = `
        <div class="lead-card-name">${lead.nombre}</div>
        <div class="lead-card-meta">
          ${lead.telefono ? `📞 ${lead.telefono}` : ''}
          ${lead.unidad ? `· ${lead.unidad}` : ''}
        </div>
        <span class="lead-card-source ${lead.fuente}">${lead.fuente}</span>
        ${lead.notas ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.4">${lead.notas.slice(0, 80)}${lead.notas.length > 80 ? '…' : ''}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <button class="btn-ghost" style="font-size:11px;padding:4px 8px" onclick="verLead('${lead.id}')">Ver</button>
          <button class="btn-ghost" style="font-size:11px;padding:4px 8px" onclick="editarLead('${lead.id}')">Editar</button>
          ${lead.telefono ? `
            <div style="display:flex; gap:4px;">
              <a class="btn-wa" style="font-size:10px;padding:4px 6px" href="${generateWALink(lead.telefono, `Hola ${lead.nombre}, un gusto saludarte. ¿Cómo va todo?`)}" target="_blank" title="Saludo">💬 Hola</a>
              <a class="btn-wa" style="font-size:10px;padding:4px 6px; background:rgba(37,99,235,0.1); color:var(--accent); border-color:var(--accent)" href="${generateWALink(lead.telefono, `Hola ${lead.nombre}, ya tengo lista tu cotización. ¿Te la envío por aquí o por correo?`)}" target="_blank" title="Cotización">📄 Cotiz.</a>
            </div>
          ` : ''}
        </div>
      `;
      card.addEventListener('dragstart', (e) => {
        draggedLeadId = lead.id;
        setTimeout(() => card.classList.add('dragging'), 0);
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      col.appendChild(card);
    });
  });
}

function allowDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function drop(e, stage) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!draggedLeadId) return;
  
  const lead = db.leads.find(l => l.id === draggedLeadId);

  if (stage === 'Venta Perdida') {
    openModal('modal-perdida');
    // Mantenemos el ID del lead en draggedLeadId para usarlo en confirmarPerdida
    return;
  }

  if (stage === 'Venta Cerrada' && lead) {
    if (!lead.email) {
      showToast('⚠️ Ingresa un Correo Electrónico para cerrar la venta', 'warning');
      editarLead(draggedLeadId);
      document.getElementById('l-etapa').value = 'Venta Cerrada';
      draggedLeadId = null;
      return;
    }
    convertirLeadACliente(lead);
  }

  RDB.ref('leads/' + draggedLeadId + '/etapa').set(stage)
    .then(() => showToast(`Lead movido a "${stage}"`));
    
  draggedLeadId = null;
}

function confirmarPerdida() {
  if (!draggedLeadId) return;
  
  const lead = db.leads.find(l => l.id === draggedLeadId);
  const reason = document.querySelector('input[name="lp-reason"]:checked').value;
  const obs = document.getElementById('lp-obs').value.trim();
  
  const updates = {
    etapa: 'Venta Perdida',
    razonPerdida: reason,
    obsPerdida: obs,
    fechaPerdida: new Date().toISOString()
  };
  
  // Alerta Gerencial si monto > 200
  if (lead && lead.montoEstimado > 200) {
    const alertId = uid();
    const vend = db.vendedores.find(v => v.id === lead.vendedor);
    RDB.ref('alertas_gerencia/' + alertId).set({
      id: alertId,
      fecha: new Date().toISOString(),
      vendedorNombre: vend ? vend.nombre : 'Sin asignar',
      clienteNombre: lead.nombre,
      monto: lead.montoEstimado,
      motivo: reason,
      obs: obs,
      visto: false
    });
  }

  RDB.ref('leads/' + draggedLeadId).update(updates)
    .then(() => {
      showToast('Motivo de pérdida registrado correctamente');
      closeModal('modal-perdida');
      draggedLeadId = null;
      document.getElementById('lp-obs').value = '';
    })
    .catch(err => showToast('Error al guardar: ' + err.message, 'danger'));
}

function renderAlertasPerdida() {
  const tbody = document.getElementById('alertas-perdida-body');
  if (!tbody) return;

  RDB.ref('alertas_gerencia').once('value', snap => {
    const alertas = snap.val() ? Object.values(snap.val()).filter(a => !a.archivado) : [];
    if (!alertas.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No hay alertas de pérdidas recientes.</td></tr>';
      return;
    }

    tbody.innerHTML = alertas.sort((a,b) => new Date(b.fecha) - new Date(a.fecha)).map(a => `
      <tr style="${!a.visto ? 'background:rgba(239,68,68,0.02)' : ''}">
        <td>${formatDate(a.fecha)}</td>
        <td>${a.vendedorNombre}</td>
        <td><strong>${a.clienteNombre}</strong></td>
        <td style="color:var(--danger); font-weight:700">${formatCurrency(a.monto)}</td>
        <td><span class="tag danger">${a.motivo}</span></td>
        <td style="font-size:11px">${a.obs || '—'}</td>
        <td>
          <button class="btn-ghost" onclick="archivarAlertaPerdida('${a.id}')">Archivar</button>
        </td>
      </tr>
    `).join('');
  });
}

function archivarAlertaPerdida(id) {
  RDB.ref('alertas_gerencia/' + id + '/archivado').set(true)
    .then(() => renderAlertasPerdida());
}

document.querySelectorAll('.pipeline-cards').forEach(col => {
  col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
});

function openLeadInStage(stage) {
  resetLeadForm();
  document.getElementById('l-etapa').value = stage;
  openModal('modal-lead');
}

function resetLeadForm() {
  document.getElementById('l-id').value = '';
  document.getElementById('l-nombre').value = '';
  document.getElementById('l-telefono').value = '';
  document.getElementById('l-email').value = '';
  document.getElementById('l-fuente').value = 'Instagram';
  document.getElementById('l-unidad').value = '';
  document.getElementById('l-etapa').value = 'Prospecto';
  document.getElementById('l-vendedor').value = '';
  document.getElementById('l-notas').value = '';
  document.getElementById('modal-lead-title').textContent = '🎯 Nuevo Lead';
  populateSelects();
}

function guardarLead() {
  const nombre = document.getElementById('l-nombre').value.trim();
  const email = document.getElementById('l-email').value.trim();
  const etapa = document.getElementById('l-etapa').value;
  if (!nombre) { showToast('El nombre es obligatorio.', 'error'); return; }

  if (etapa === 'Venta Cerrada' && !email) {
    showToast('Debes ingresar un Correo Electrónico para la Venta Cerrada.', 'error');
    document.getElementById('l-email').focus();
    return;
  }

  const monto = parseFloat(document.getElementById('l-monto').value) || 0;
  const existingId = document.getElementById('l-id').value;
  const lead = {
    id: existingId || uid(),
    nombre,
    telefono: document.getElementById('l-telefono').value.trim(),
    email,
    fuente: document.getElementById('l-fuente').value,
    unidad: document.getElementById('l-unidad').value,
    etapa,
    vendedor: document.getElementById('l-vendedor').value,
    notas: document.getElementById('l-notas').value.trim(),
    montoEstimado: monto,
    fecha: todayStr(),
  };

  if (etapa === 'Venta Cerrada') {
    convertirLeadACliente(lead);
  }

  RDB.ref('leads/' + lead.id).set(lead).then(() => {
    closeModal('modal-lead');
    showToast('✅ Lead guardado.');
  });
}

function convertirLeadACliente(lead) {
  if (!lead.email) return;
  const existingClient = db.clientes.find(c => c.email && c.email.toLowerCase() === lead.email.toLowerCase());
  if (existingClient) return;
  
  const cli = {
    id: uid(),
    nombre: lead.nombre,
    telefono: lead.telefono,
    email: lead.email,
    fuente: lead.fuente,
    notas: `[Importado del Lead] ${lead.notas || ''}`.trim()
  };
  RDB.ref('clientes/' + cli.id).set(cli);
}

function editarLead(id) {
  const lead = db.leads.find(l => l.id === id);
  if (!lead) return;
  resetLeadForm();
  document.getElementById('modal-lead-title').textContent = '✏️ Editar Lead';
  document.getElementById('l-id').value = lead.id;
  document.getElementById('l-nombre').value = lead.nombre;
  document.getElementById('l-telefono').value = lead.telefono;
  document.getElementById('l-email').value = lead.email || '';
  document.getElementById('l-fuente').value = lead.fuente;
  document.getElementById('l-unidad').value = lead.unidad;
  document.getElementById('l-etapa').value = lead.etapa;
  document.getElementById('l-vendedor').value = lead.vendedor;
  document.getElementById('l-monto').value = lead.montoEstimado || '';
  document.getElementById('l-notas').value = lead.notas;
  openModal('modal-lead');
}

function verLead(id) {
  const lead = db.leads.find(l => l.id === id);
  if (!lead) return;
  const vendedor = db.vendedores.find(v => v.id === lead.vendedor);
  document.getElementById('modal-lead-detalle-title').textContent = `👤 ${lead.nombre}`;
  document.getElementById('modal-lead-detalle-body').innerHTML = `
    <div style="display:grid;gap:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Fuente</label><div><span class="lead-card-source ${lead.fuente}" style="font-size:13px;padding:4px 10px">${lead.fuente}</span></div></div>
        <div class="form-group"><label class="form-label">Etapa</label><div>${lead.etapa}</div></div>
        <div class="form-group"><label class="form-label">Teléfono</label><div>${lead.telefono || '—'}</div></div>
        <div class="form-group"><label class="form-label">Unidad</label><div>${lead.unidad || '—'}</div></div>
        <div class="form-group"><label class="form-label">Vendedor Asignado</label><div>${vendedor ? vendedor.nombre : 'Sin asignar'}</div></div>
        <div class="form-group"><label class="form-label">Fecha de Registro</label><div>${formatDate(lead.fecha)}</div></div>
      </div>
      ${lead.notas ? `<div class="form-group"><label class="form-label">Notas / Acuerdos</label><div style="background:var(--bg-dark);padding:12px;border-radius:8px;font-size:13px;line-height:1.6;color:var(--text-secondary)">${lead.notas}</div></div>` : ''}
    </div>
  `;
  document.getElementById('modal-lead-detalle-footer').innerHTML = `
    ${lead.telefono ? `<a class="btn-wa" href="${generateWALink(lead.telefono, `Hola ${lead.nombre}, `)}" target="_blank">💬 Contactar por WhatsApp</a>` : ''}
    <button class="btn-secondary" onclick="closeModal('modal-lead-detalle')">Cerrar</button>
    <button class="btn-primary" onclick="closeModal('modal-lead-detalle');editarLead('${lead.id}')">✏️ Editar</button>
  `;
  openModal('modal-lead-detalle');
}

// ─── RECORDATORIOS ────────────────────────────────────────────
function updateReminderBadge() {
  const pending = db.recordatorios.filter(r => {
    if (r.estado === 'contactado') return false;
    return daysUntil(r.fechaRecordatorio) <= 0;
  }).length;
  const badge = document.getElementById('badge-recordatorios');
  badge.textContent = pending || '';
}

function renderRecordatorios() {
  const filterEstado = document.getElementById('rec-filter-estado')?.value || '';
  const container = document.getElementById('recordatorios-list');
  const today = new Date(); today.setHours(12, 0, 0, 0);

  let recs = [...db.recordatorios];
  if (filterEstado === 'pendiente') recs = recs.filter(r => r.estado === 'pendiente');
  if (filterEstado === 'contactado') recs = recs.filter(r => r.estado === 'contactado');

  recs.sort((a, b) => new Date(a.fechaRecordatorio) - new Date(b.fechaRecordatorio));

  if (!recs.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔔</div><div class="empty-state-title">Sin recordatorios</div><p>Los recordatorios aparecerán aquí 25 días después de una venta de Consumibles.</p></div>`;
    return;
  }

  container.innerHTML = recs.map(r => {
    const days = daysUntil(r.fechaRecordatorio);
    let cardClass = 'reminder-card';
    let icon = '🔔';
    let daysText = '';

    if (r.estado === 'contactado') {
      cardClass += ' contactado';
      icon = '✅';
      daysText = 'Contactado';
    } else if (days < 0) {
      cardClass += ' vencido';
      icon = '🔴';
      daysText = `Vencido hace ${Math.abs(days)} día${Math.abs(days) !== 1 ? 's' : ''}`;
    } else if (days === 0) {
      cardClass += ' hoy';
      icon = '🟡';
      daysText = '¡Hoy!';
    } else {
      cardClass += ' proximo';
      icon = '🟢';
      daysText = `En ${days} día${days !== 1 ? 's' : ''}`;
    }

    const venData = db.ventas.find(v => v.id === r.ventaId);
    const waMsg = `Hola ${r.clienteNombre}! 🙂 Quería saludarte y preguntarte cómo va con ${r.productoNombre}. Estamos disponibles si necesitas reponer o tienes alguna consulta. ¡Saludos del equipo Casa Matriz!`;

    return `<div class="${cardClass}">
      <div class="reminder-icon">${icon}</div>
      <div class="reminder-info">
        <div class="reminder-title">${r.clienteNombre}</div>
        <div class="reminder-meta">
          📦 ${r.productoNombre} · Venta: ${formatDate(r.fechaVenta)}
          ${venData ? ` · ${venData.vendedorNombre}` : ''}
        </div>
      </div>
      <div class="reminder-date">${daysText}<br><span style="font-size:11px;color:var(--text-muted)">${formatDate(r.fechaRecordatorio)}</span></div>
      <div class="reminder-actions">
        ${r.clienteTel ? `<a class="btn-wa" href="${generateWALink(r.clienteTel, waMsg)}" target="_blank">💬 WhatsApp</a>` : ''}
        ${r.estado === 'pendiente'
          ? `<button class="btn-ghost" onclick="marcarContactado('${r.id}')">✅ Marcar Contactado</button>`
          : `<button class="btn-ghost" onclick="marcarPendiente('${r.id}')">Reabrir</button>`}
      </div>
    </div>`;
  }).join('');
}

function marcarContactado(id) {
  RDB.ref('recordatorios/' + id + '/estado').set('contactado')
    .then(() => showToast('✅ Marcado como contactado.'));
}

function marcarPendiente(id) {
  RDB.ref('recordatorios/' + id + '/estado').set('pendiente');
}

// ─── CATÁLOGO ─────────────────────────────────────────────────
function resetProductoForm() {
  document.getElementById('p-id').value = '';
  document.getElementById('p-nombre').value = '';
  document.getElementById('p-unidad').value = '';
  document.getElementById('p-precio').value = '';
  document.getElementById('p-desc-max').value = '20';
  document.getElementById('p-descripcion').value = '';
  document.getElementById('p-imagen').value = '';
  document.getElementById('p-imagen-url').value = '';
  const preview = document.getElementById('p-preview');
  preview.src = '';
  preview.style.display = 'none';
  document.getElementById('modal-producto-title').textContent = '📦 Nuevo Producto';
}

async function guardarProducto() {
  const nombre = document.getElementById('p-nombre').value.trim();
  const unidad = document.getElementById('p-unidad').value;
  const precio = parseFloat(document.getElementById('p-precio').value);
  if (!nombre || !unidad || isNaN(precio)) {
    showToast('Completa todos los campos obligatorios.', 'error'); return;
  }
  
  const file = document.getElementById('p-imagen').files[0];
  const manualUrl = document.getElementById('p-imagen-url').value.trim();
  let imageUrl = manualUrl;
  const existingId = document.getElementById('p-id').value;
  const pid = existingId || uid();

  if (file) {
    showToast('🚀 Subiendo imagen (máx 5s)...', 'info');
    
    // Función de subida envuelta en una promesa con timeout
    const uploadTask = STO.ref(`productos/${pid}/${file.name}`).put(file);
    
    const uploadPromise = new Promise((resolve, reject) => {
      uploadTask.then(async (snapshot) => {
        const url = await snapshot.ref.getDownloadURL();
        resolve(url);
      }).catch(reject);
    });

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('timeout')), 5000)
    );

    try {
      imageUrl = await Promise.race([uploadPromise, timeoutPromise]);
    } catch (err) {
      console.error('Error o timeout en subida:', err);
      if (err.message === 'timeout') {
         showToast('⌛ La subida tarda demasiado. Guardando sin foto por ahora...', 'warning');
      } else {
         showToast('❌ Error de Storage. Verifica tus permisos.', 'warning');
      }
    }
  } else if (existingId) {
    const existingProd = db.productos.find(p => p.id === existingId);
    if (existingProd) imageUrl = existingProd.imageUrl || '';
  }

  const prod = {
    id: pid,
    nombre,
    unidad,
    precio,
    descMax: parseFloat(document.getElementById('p-desc-max').value) || 20,
    descripcion: document.getElementById('p-descripcion').value.trim(),
    imageUrl
  };
  
  RDB.ref('productos/' + prod.id).set(prod).then(() => {
    closeModal('modal-producto');
    showToast('✅ Producto guardado exitosamente.');
  });
}

function editarProducto(id) {
  const prod = db.productos.find(p => p.id === id);
  if (!prod) return;
  resetProductoForm();
  document.getElementById('modal-producto-title').textContent = '✏️ Editar Producto';
  document.getElementById('p-id').value = prod.id;
  document.getElementById('p-nombre').value = prod.nombre;
  document.getElementById('p-unidad').value = prod.unidad;
  document.getElementById('p-precio').value = prod.precio;
  document.getElementById('p-desc-max').value = prod.descMax;
  document.getElementById('p-descripcion').value = prod.descripcion;
  
  if (prod.imageUrl) {
    const preview = document.getElementById('p-preview');
    preview.src = prod.imageUrl;
    preview.style.display = 'block';
  }
  openModal('modal-producto');
}

function eliminarProducto(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  RDB.ref('productos/' + id).remove()
    .then(() => showToast('Producto eliminado.', 'warning'));
}

function renderCatalogo() {
  const filterUnidad = document.getElementById('cat-filter-unidad')?.value || '';
  const search = (document.getElementById('cat-search')?.value || '').toLowerCase();
  const grid = document.getElementById('products-grid');

  let prods = db.productos
    .filter(p => !filterUnidad || p.unidad === filterUnidad)
    .filter(p => !search || p.nombre.toLowerCase().includes(search) || (p.descripcion && p.descripcion.toLowerCase().includes(search)));

  if (!prods.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">📦</div><div class="empty-state-title">Sin productos</div></div>`;
    return;
  }

    grid.innerHTML = prods.map(p => {
    const color = getUnitColor(p.unidad);
    const stock = p.stock || 0;
    const isLow = stock < 5;
    const lowStockTag = isLow ? `<span class="tag danger" style="position:absolute; top:10px; right:10px; z-index:1; box-shadow:0 4px 12px rgba(239,68,68,0.2)">⚠️ BAJO STOCK (${stock})</span>` : '';
    
    return `<div class="product-card" style="position:relative">
      ${lowStockTag}
      <div class="product-card-image">
        ${p.imageUrl 
          ? `<img src="${p.imageUrl}" alt="${p.nombre}" style="width:100%; height:150px; object-fit:cover; border-radius:12px 12px 0 0">`
          : `<div style="width:100%; height:150px; background:var(--bg-dark); border-radius:12px 12px 0 0; display:flex; align-items:center; justify-content:center; font-size:40px">📦</div>`
        }
      </div>
      <div class="product-card-body" style="padding:15px">
        <div class="product-card-header">
          <div>
            <span class="tag" style="background:${color}22; color:${color}">${p.unidad}</span>
            <div class="product-card-name" style="margin-top:8px">${p.nombre}</div>
          </div>
        </div>
        ${p.descripcion ? `<div class="product-card-meta" style="margin-bottom:8px; font-size:12px">${p.descripcion}</div>` : ''}
        <div class="product-card-price">${formatCurrency(p.precio)}</div>
        <div class="product-card-meta">Desc. máx. permitido: <strong>${p.descMax}%</strong></div>
        <div style="margin-top:10px; margin-bottom:10px">
          <span class="stock-badge ${p.stock > 0 ? 'ok' : 'low'}">Stock: ${p.stock || 0}</span>
        </div>
        <div class="product-card-actions action-restricted" style="display:flex; gap:10px">
          <button class="btn-ghost" onclick="editarProducto('${p.id}')">✏️ Editar</button>
          <button class="btn-danger" onclick="eliminarProducto('${p.id}')">✕ Eliminar</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── VENDEDORES ───────────────────────────────────────────────
function resetVendedorForm() {
  document.getElementById('vend-id').value = '';
  document.getElementById('vend-nombre').value = '';
  document.getElementById('vend-telefono').value = '';
  document.getElementById('vend-con').checked = false;
  document.getElementById('vend-hog').checked = false;
  document.getElementById('vend-maq').checked = false;
}

function guardarVendedor() {
  const nombre = document.getElementById('vend-nombre').value.trim();
  if (!nombre) { showToast('El nombre es obligatorio.', 'error'); return; }
  const unidades = [];
  if (document.getElementById('vend-con').checked) unidades.push('Consumibles');
  if (document.getElementById('vend-hog').checked) unidades.push('Línea Hogar');
  if (document.getElementById('vend-maq').checked) unidades.push('Maquinaria');

  const existingId = document.getElementById('vend-id').value;
  const vend = { id: existingId || uid(), nombre, telefono: document.getElementById('vend-telefono').value.trim(), unidades };
  RDB.ref('vendedores/' + vend.id).set(vend).then(() => {
    closeModal('modal-vendedor'); showToast('✅ Vendedor guardado.');
  });
}

function eliminarVendedor(id) {
  if (!confirm('¿Eliminar este vendedor?')) return;
  RDB.ref('vendedores/' + id).remove()
    .then(() => showToast('Vendedor eliminado.', 'warning'));
}

function renderVendedores() {
  const grid = document.getElementById('vendedores-grid');
  if (!db.vendedores.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">👥</div><div class="empty-state-title">Sin vendedores registrados</div></div>';
    return;
  }
  grid.innerHTML = db.vendedores.map(v => {
    const ventas = db.ventas.filter(s => s.vendedorId === v.id);
    const total = ventas.reduce((a, b) => a + b.total, 0);
    return `<div class="vend-card">
      <div class="vend-avatar">${v.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
      <div class="vend-name">${v.nombre}</div>
      <div class="vend-tel">${v.telefono || 'Sin teléfono'}</div>
      <div class="vend-units">${v.unidades.map(u => {
        const color = getUnitColor(u);
        return `<span class="tag" style="background:${color}22; color:${color}">${u}</span>`;
      }).join('')}</div>
      <div class="vend-stats">${ventas.length} venta${ventas.length !== 1 ? 's' : ''} · ${formatCurrency(total)}</div>
      <div class="product-card-actions" style="margin-top:12px">
        <button class="btn-danger" onclick="eliminarVendedor('${v.id}')">✕ Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

// ─── CLIENTES ─────────────────────────────────────────────────
function resetClienteForm() {
  document.getElementById('cli-id').value = '';
  document.getElementById('cli-nombre').value = '';
  document.getElementById('cli-ident').value = '';
  document.getElementById('cli-telefono').value = '';
  document.getElementById('cli-email').value = '';
  document.getElementById('cli-ubica').value = '';
  document.getElementById('cli-tipo').value = 'Natural';
  document.getElementById('cli-fuente').value = 'Instagram';
  document.getElementById('cli-notas').value = '';
  document.getElementById('modal-cliente-title').textContent = '🤝 Nuevo Cliente';
}

function guardarCliente() {
  const nombre = document.getElementById('cli-nombre').value.trim();
  const tel = document.getElementById('cli-telefono').value.trim();
  if (!nombre || !tel) return showToast('Nombre y teléfono son obligatorios.', 'error');

  const cli = {
    id: document.getElementById('cli-id').value || uid(),
    nombre,
    identificacion: document.getElementById('cli-ident').value.trim(),
    telefono: tel,
    email: document.getElementById('cli-email').value.trim(),
    ubicacion: document.getElementById('cli-ubica').value.trim(),
    tipo: document.getElementById('cli-tipo').value,
    fuente: document.getElementById('cli-fuente').value,
    notas: document.getElementById('cli-notas').value.trim(),
  };
  RDB.ref('clientes/' + cli.id).set(cli).then(() => {
    closeModal('modal-cliente'); showToast('✅ Cliente guardado.');
  });
}

function editarCliente(id) {
  const cli = db.clientes.find(c => c.id === id);
  if (!cli) return;
  resetClienteForm();
  document.getElementById('modal-cliente-title').textContent = '✏️ Editar Cliente';
  document.getElementById('cli-id').value = cli.id;
  document.getElementById('cli-nombre').value = cli.nombre;
  document.getElementById('cli-ident').value = cli.identificacion || '';
  document.getElementById('cli-telefono').value = cli.telefono;
  document.getElementById('cli-email').value = cli.email;
  document.getElementById('cli-ubica').value = cli.ubicacion || '';
  document.getElementById('cli-tipo').value = cli.tipo || 'Natural';
  document.getElementById('cli-fuente').value = cli.fuente;
  document.getElementById('cli-notas').value = cli.notas;
  openModal('modal-cliente');
}

function eliminarCliente(id) {
  if (!confirm('¿Eliminar este cliente?')) return;
  RDB.ref('clientes/' + id).remove()
    .then(() => showToast('Cliente eliminado.', 'warning'));
}

function renderClientes() {
  const search = (document.getElementById('cli-search')?.value || '').toLowerCase();
  const tbody = document.getElementById('clientes-body');
  const clientes = db.clientes.filter(c => !search || c.nombre.toLowerCase().includes(search) || c.telefono.includes(search));
  if (!clientes.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No hay clientes registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = clientes.map(c => {
    const waMsg = `Hola ${c.nombre}! 😊 Le saluda el equipo de Casa Matriz. ¿En qué podemos ayudarle hoy?`;
    return `<tr>
      <td><strong>${c.nombre}</strong></td>
      <td>${c.identificacion || '—'}</td>
      <td>
        <a class="btn-wa" href="${generateWALink(c.telefono, waMsg)}" target="_blank" style="text-decoration:none">💬 ${c.telefono}</a>
      </td>
      <td><span class="tag info">${c.tipo || 'Natural'}</span></td>
      <td style="font-size:12px">${c.ubicacion || '—'}</td>
      <td><span class="lead-card-source ${c.fuente}" style="font-size:11px">${c.fuente}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${c.notas || '—'}</td>
      <td>
        <div style="display:flex;gap:6px" class="action-restricted">
          <button class="btn-ghost" onclick="editarCliente('${c.id}')">✏️</button>
          <button class="btn-danger" onclick="eliminarCliente('${c.id}')">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── DASHBOARD ────────────────────────────────────────────────
function renderDashboard() {
  const filterMes = parseInt(document.getElementById('dash-filter-mes')?.value) || 0;

  let ventas = db.ventas;
  if (filterMes) {
    ventas = ventas.filter(v => {
      const m = new Date(v.fecha + 'T00:00:00').getMonth() + 1;
      return m === filterMes;
    });
  }

  const totalBruto = ventas.reduce((a, b) => a + b.total, 0);
  const totalDescuento = ventas.reduce((a, b) => a + b.descuentoAmt, 0);
  const ventasConDesc = ventas.filter(v => v.descuentoPct > 0).length;
  const pendAuth = ventas.filter(v => v.necAuth && !v.authOk).length;

  // KPI Cards
  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi-card accent">
      <div class="kpi-icon">💰</div>
      <div class="kpi-label">Total Ventas</div>
      <div class="kpi-value">${formatCurrency(totalBruto)}</div>
      <div class="kpi-sub">${ventas.length} transacciones</div>
    </div>
    <div class="kpi-card danger">
      <div class="kpi-icon">🏷️</div>
      <div class="kpi-label">Descuentos Otorgados</div>
      <div class="kpi-value">${formatCurrency(totalDescuento)}</div>
      <div class="kpi-sub">${ventasConDesc} ventas con descuento</div>
    </div>
    <div class="kpi-card warning">
      <div class="kpi-icon">⚠️</div>
      <div class="kpi-label">Pendientes Autorización</div>
      <div class="kpi-value" style="color:${pendAuth ? 'var(--danger)' : 'var(--success)'}">${pendAuth}</div>
      <div class="kpi-sub">Descuentos sobre límite</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🎯</div>
      <div class="kpi-label">Total Leads</div>
      <div class="kpi-value">${db.leads.length}</div>
      <div class="kpi-sub">${db.leads.filter(l => l.etapa === 'Venta Cerrada').length} cerrados</div>
    </div>
  `;

  // Chart por unidad
  const units = getUnidades();
  const unitTotals = units.map(u => ventas.filter(v => v.unidad === u).reduce((a, b) => a + b.total, 0));
  const maxUnit = Math.max(...unitTotals, 1);

  document.getElementById('chart-unidades').innerHTML = units.map((u, i) => {
    const color = getUnitColor(u);
    return `
    <div class="bar-item">
      <div class="bar-label">${u}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(unitTotals[i] / maxUnit * 100).toFixed(1)}%;background:${color}"></div></div>
      <div class="bar-value" style="color:${color}">${formatCurrency(unitTotals[i])}</div>
    </div>`;
  }).join('');

  // Chart por vendedor
  const vendMap = {};
  ventas.forEach(v => {
    vendMap[v.vendedorNombre] = (vendMap[v.vendedorNombre] || 0) + v.total;
  });
  const vendEntries = Object.entries(vendMap).sort((a, b) => b[1] - a[1]);
  const maxVend = Math.max(...vendEntries.map(e => e[1]), 1);

  document.getElementById('chart-vendedores').innerHTML = vendEntries.length
    ? vendEntries.map(([name, total]) => `
        <div class="bar-item">
          <div class="bar-label">${name}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(total / maxVend * 100).toFixed(1)}%;background:var(--accent)"></div></div>
          <div class="bar-value">${formatCurrency(total)}</div>
        </div>
      `).join('')
    : '<div style="color:var(--text-muted);font-size:13px;padding:20px 0">Sin datos de ventas aún.</div>';

  // Alertas table (Descuentos)
  const alertasVentas = ventas.filter(v => v.necAuth);
  const alertasBody = document.getElementById('alertas-body');
  if (alertasBody) {
    alertasBody.innerHTML = alertasVentas.length
      ? alertasVentas.map(v => `<tr>
          <td>${formatDate(v.fecha)}</td>
          <td>${v.clienteNombre}</td>
          <td>${v.productoNombre}</td>
          <td><span class="tag" style="background:${getUnitColor(v.unidad)}22; color:${getUnitColor(v.unidad)}">${v.unidad}</span></td>
          <td><span class="tag danger">${v.descuentoPct}%</span></td>
          <td>${formatCurrency(v.precioFinal)}</td>
          <td>${v.vendedorNombre}</td>
          <td style="font-size:12px;max-width:180px">${v.justificacion || '—'}</td>
          <td>${v.authOk
            ? '<span class="tag success">✅ Autorizada</span>'
            : `<button class="btn-primary btn-sm" onclick="autorizarVenta('${v.id}');renderDashboard()">Autorizar</button>`}</td>
        </tr>`).join('')
      : '<tr class="empty-row"><td colspan="9">No hay ventas con descuentos elevados.</td></tr>';
  }

  // Alertas de Pérdida (Alto Valor)
  renderAlertasPerdida();
}

// ─── ANALÍTICA GERENCIAL ──────────────────────────────────────
function renderAnalitica() {
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const FUENTE_COLORS = { 'Directo':'var(--accent)', 'Instagram':'#e1306c', 'Facebook':'#1877f2', 'WhatsApp':'#25d366', 'Referido':'#8b5cf6' };

  // Populate year filter
  const years = [...new Set(db.ventas.map(v => v.fecha.slice(0,4)))].sort().reverse();
  const selAnio = document.getElementById('an-filter-anio');
  const curAnio = selAnio.value;
  selAnio.innerHTML = '<option value="">Todos los años</option>';
  years.forEach(y => selAnio.innerHTML += `<option value="${y}"${curAnio===y?' selected':''}>${y}</option>`);

  const filterAnio = selAnio.value;
  const filterUnidad = document.getElementById('an-filter-unidad').value;

  let ventas = db.ventas
    .filter(v => !filterAnio || v.fecha.startsWith(filterAnio))
    .filter(v => !filterUnidad || v.unidad === filterUnidad);

  const totalBruto = ventas.reduce((a,b) => a+b.total, 0);
  const totalDesc = ventas.reduce((a,b) => a+b.descuentoAmt, 0);
  const totalNeto = totalBruto - totalDesc;
  const ticketProm = ventas.length ? totalBruto / ventas.length : 0;
  const pctDesc = totalBruto > 0 ? (totalDesc / totalBruto * 100) : 0;

  // --- KPI Grid ---
  // Éxito = Venta Cerrada + Post-venta
  const leadsExitosos = db.leads.filter(l => l.etapa === 'Venta Cerrada' || l.etapa === 'Post-venta').length;
  // Leads finalizados = Venta Cerrada + Post-venta + Venta Perdida
  const leadsFinalizados = db.leads.filter(l => ['Venta Cerrada', 'Post-venta', 'Venta Perdida'].includes(l.etapa)).length;
  const convRate = leadsFinalizados > 0 ? (leadsExitosos / leadsFinalizados * 100).toFixed(0) : 0;
  document.getElementById('an-kpi-grid').innerHTML = `
    <div class="kpi-card accent">
      <div class="kpi-icon">💵</div>
      <div class="kpi-label">Ingresos Netos</div>
      <div class="kpi-value">${formatCurrency(totalNeto)}</div>
      <div class="kpi-sub">Bruto: ${formatCurrency(totalBruto)}</div>
    </div>
    <div class="kpi-card danger">
      <div class="kpi-icon">🏷️</div>
      <div class="kpi-label">Impacto Descuentos</div>
      <div class="kpi-value" style="color:var(--danger)">${pctDesc.toFixed(1)}%</div>
      <div class="kpi-sub">${formatCurrency(totalDesc)} cedidos</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🎫</div>
      <div class="kpi-label">Ticket Promedio</div>
      <div class="kpi-value">${formatCurrency(ticketProm)}</div>
      <div class="kpi-sub">${ventas.length} transacciones</div>
    </div>
    <div class="kpi-card accent">
      <div class="kpi-icon">🔄</div>
      <div class="kpi-label">Tasa de Conversión</div>
      <div class="kpi-value" style="color:var(--success)">${convRate}%</div>
      <div class="kpi-sub">${leadsExitosos} de ${leadsFinalizados} leads finalizados</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">👥</div>
      <div class="kpi-label">Clientes Activos</div>
      <div class="kpi-value">${db.clientes.length}</div>
      <div class="kpi-sub">${[...new Set(ventas.map(v=>v.clienteId))].length} con compras</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">📦</div>
      <div class="kpi-label">Recordatorios Pendientes</div>
      <div class="kpi-value" style="color:var(--warning)">${db.recordatorios.filter(r=>r.estado==='pendiente'&&daysUntil(r.fechaRecordatorio)<=3).length}</div>
      <div class="kpi-sub">Vencen en ≤ 3 días</div>
    </div>
  `;

  // --- ESTACIONALIDAD (12 meses) ---
  const ventasPorMes = Array(12).fill(0);
  ventas.forEach(v => {
    const m = parseInt(v.fecha.slice(5,7)) - 1;
    ventasPorMes[m] += v.total;
  });
  const maxMes = Math.max(...ventasPorMes, 1);
  const estHTML = ventas.length
    ? MESES.map((mes, i) => {
        const pct = (ventasPorMes[i] / maxMes * 100).toFixed(1);
        const isMax = ventasPorMes[i] === maxMes && maxMes > 0;
        const color = isMax ? 'var(--accent)' : 'var(--maquinaria)';
        return `<div class="hbar-item">
          <div class="hbar-label">${MESES_FULL[i]}</div>
          <div class="hbar-track"><div class="hbar-fill" style="width:${pct}%;background:${color}"></div></div>
          <div class="hbar-value" style="color:${isMax?'var(--accent)':''}">${formatCurrency(ventasPorMes[i])}</div>
        </div>`;
      }).join('')
    : '<div class="analytics-empty">📊 Sin ventas para mostrar estacionalidad. Registra ventas para ver la evolución mensual.</div>';
  document.getElementById('an-chart-estacionalidad').innerHTML = estHTML;

  // --- FRECUENCIA DE RECOMPRA ---
  const freqMap = {};
  ventas.forEach(v => {
    if (!freqMap[v.clienteId]) freqMap[v.clienteId] = { nombre: v.clienteNombre, count: 0, total: 0 };
    freqMap[v.clienteId].count++;
    freqMap[v.clienteId].total += v.total;
  });
  const freqList = Object.values(freqMap).sort((a,b) => b.count - a.count).slice(0, 10);
  document.getElementById('an-frecuencia-list').innerHTML = freqList.length
    ? freqList.map(c => `<div class="freq-item">
        <div class="freq-avatar">${c.nombre.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
        <div class="freq-info">
          <div class="freq-name">${c.nombre}</div>
          <div class="freq-meta">${formatCurrency(c.total)} en compras</div>
        </div>
        <div class="freq-badge">${c.count} ${c.count===1?'compra':'compras'}</div>
      </div>`).join('')
    : '<div class="analytics-empty">Sin datos de recompras aún.</div>';

  // --- FUNNEL DE CONVERSIÓN ---
  const fStages = ['Prospecto','Cotización Enviada','Venta Cerrada','Post-venta','Venta Perdida'];
  const fColors = ['#94a3b8','var(--hogar)','var(--success)','var(--accent)', 'var(--danger)'];
  const fCounts = fStages.map(s => db.leads.filter(l => l.etapa === s).length);
  const fMax = Math.max(...fCounts, 1);
  const totalLeads = fCounts.reduce((a,b) => a+b, 0);
  document.getElementById('an-funnel').innerHTML = `<div class="funnel-container">${
    fStages.map((s, i) => {
      const pct = (fCounts[i] / fMax * 100).toFixed(0);
      const ratio = totalLeads > 0 ? (fCounts[i] / totalLeads * 100).toFixed(0) : 0;
      return `<div class="funnel-step">
        <div class="funnel-label">${s}</div>
        <div class="funnel-bar-wrap">
          <div class="funnel-track">
            <div class="funnel-fill" style="width:${pct}%;background:${fColors[i]}">${fCounts[i] > 0 ? fCounts[i] + ' leads' : ''}</div>
          </div>
        </div>
        <div class="funnel-pct">${ratio}%</div>
        <div class="funnel-count">${fCounts[i]}</div>
      </div>`;
    }).join('')
  }</div>`;

  // --- IMPACTO DE DESCUENTOS POR UNIDAD ---
  const units = getUnidades();
  const descHTML = units.map(u => {
    const uVentas = ventas.filter(v => v.unidad === u);
    const bruto = uVentas.reduce((a,b) => a+b.total,0) + uVentas.reduce((a,b)=>a+b.descuentoAmt,0);
    const desc = uVentas.reduce((a,b)=>a+b.descuentoAmt,0);
    const net = bruto - desc;
    const descPct = bruto > 0 ? (desc/bruto*100).toFixed(1) : 0;
    const netPct = bruto > 0 ? (net/bruto*100) : 0;
    if (bruto === 0) return '';
    const color = getUnitColor(u);
    return `<div class="desc-impact-item">
      <div class="desc-impact-header">
        <span>${u}</span>
        <span style="color:var(--danger)">${descPct}% en descuentos</span>
      </div>
      <div class="desc-stacked-track">
        <div class="desc-stacked-net" style="background:${color}; width:${netPct.toFixed(1)}%"></div>
        <div class="desc-stacked-desc" style="width:${(100-netPct).toFixed(1)}%"></div>
      </div>
      <div class="desc-impact-sub">Neto: ${formatCurrency(net)} · Descuento cedido: ${formatCurrency(desc)}</div>
    </div>`;
  }).join('');
  document.getElementById('an-descuentos').innerHTML = descHTML || '<div class="analytics-empty">Sin datos para el período seleccionado.</div>';

  // --- TOP PRODUCTOS ---
  const prodMap = {};
  ventas.forEach(v => {
    if (v.items) {
      v.items.forEach(item => {
        if (!prodMap[item.nombre]) prodMap[item.nombre] = { total: 0, count: 0, unidad: item.unidad };
        prodMap[item.nombre].total += item.total;
        prodMap[item.nombre].count += item.cantidad;
      });
    } else {
      // Legacy support
      if (!prodMap[v.productoNombre]) prodMap[v.productoNombre] = { total: 0, count: 0, unidad: v.unidad };
      prodMap[v.productoNombre].total += v.total;
      prodMap[v.productoNombre].count += v.cantidad;
    }
  });
  const topProds = Object.entries(prodMap).sort((a,b) => b[1].total - a[1].total).slice(0,6);
  const maxProd = topProds.length ? topProds[0][1].total : 1;
  document.getElementById('an-top-productos').innerHTML = topProds.length
    ? topProds.map(([name, data]) => `<div class="bar-item">
        <div class="bar-label" title="${name}">${name}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(data.total/maxProd*100).toFixed(1)}%;background:${getUnitColor(data.unidad)}"></div></div>
        <div class="bar-value">${formatCurrency(data.total)}</div>
      </div>`).join('')
    : '<div class="analytics-empty">Sin datos aún.</div>';

  // --- CANALES DE ADQUISICIÓN ---
  const canalMap = {};
  ventas.forEach(v => {
    if (!canalMap[v.fuente]) canalMap[v.fuente] = { total: 0, count: 0 };
    canalMap[v.fuente].total += v.total;
    canalMap[v.fuente].count++;
  });
  const canales = Object.entries(canalMap).sort((a,b) => b[1].total - a[1].total);
  const maxCanal = canales.length ? canales[0][1].total : 1;
  document.getElementById('an-canales').innerHTML = canales.length
    ? canales.map(([canal, data]) => `<div class="hbar-item">
        <div class="hbar-label">${canal}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${(data.total/maxCanal*100).toFixed(1)}%;background:${FUENTE_COLORS[canal]||'var(--accent)'}"></div></div>
        <div class="hbar-value">${formatCurrency(data.total)} · ${data.count} ventas</div>
      </div>`).join('')
    : '<div class="analytics-empty">Sin ventas registradas con fuente de canal.</div>';

  // --- TABLA VENDEDORES ---
  const vendRows = db.vendedores.map(vend => {
    const vv = ventas.filter(v => v.vendedorId === vend.id);
    const ing = vv.reduce((a,b)=>a+b.total,0);
    const desc = vv.reduce((a,b)=>a+b.descuentoAmt,0);
    const ticket = vv.length ? ing/vv.length : 0;
    const pctDescProm = vv.filter(v=>v.descuentoPct>0).length
      ? (vv.filter(v=>v.descuentoPct>0).reduce((a,b)=>a+b.descuentoPct,0) / vv.filter(v=>v.descuentoPct>0).length).toFixed(1)
      : 0;

    // Score: 1-5 based on revenue relative to max
    const maxVend = Math.max(...db.vendedores.map(v2 => {
      return ventas.filter(v=>v.vendedorId===v2.id).reduce((a,b)=>a+b.total,0);
    }), 1);
    const scoreRaw = Math.round((ing / maxVend) * 5);
    const scoreClass = scoreRaw >= 4 ? 'high' : scoreRaw >= 2 ? 'medium' : 'low';
    const dots = Array(5).fill(0).map((_,i) =>
      `<div class="score-dot${i < scoreRaw ? ` filled ${scoreClass}` : ''}"></div>`
    ).join('');

    return `<tr>
      <td><strong>${vend.nombre}</strong></td>
      <td>${vv.length}</td>
      <td>${formatCurrency(ing)}</td>
      <td>${formatCurrency(ticket)}</td>
      <td class="text-danger">${formatCurrency(desc)}</td>
      <td>${pctDescProm > 0 ? `<span class="tag ${parseFloat(pctDescProm)>15?'danger':'warning'}">${pctDescProm}%</span>` : '—'}</td>
      <td><div class="score-bar"><div class="score-dots">${dots}</div></div></td>
    </tr>`;
  }).join('');
  document.getElementById('an-tabla-vendedores').innerHTML = vendRows || '<tr class="empty-row"><td colspan="7">Sin vendedores registrados.</td></tr>';

  // --- INSIGHTS AUTOMÁTICOS ---
  const insights = [];

  if (ventas.length === 0) {
    insights.push({ type:'info', icon:'📊', text:'<strong>Sin datos suficientes.</strong> Registra ventas para generar insights automáticos.' });
  } else {
    // Mes pico
    const maxMesIdx = ventasPorMes.indexOf(Math.max(...ventasPorMes));
    if (ventasPorMes[maxMesIdx] > 0) {
      insights.push({ type:'positive', icon:'📅', text:`El mes con mayor volumen de ventas es <strong>${MESES_FULL[maxMesIdx]}</strong> (${formatCurrency(ventasPorMes[maxMesIdx])}). Considera reforzar inventario y campaña ese mes.` });
    }

    // Mes valle
    const nonZeroMeses = ventasPorMes.filter(v=>v>0);
    if (nonZeroMeses.length > 1) {
      const minVal = Math.min(...nonZeroMeses);
      const minIdx = ventasPorMes.indexOf(minVal);
      insights.push({ type:'neutral', icon:'📉', text:`<strong>${MESES_FULL[minIdx]}</strong> es el mes más bajo (${formatCurrency(minVal)}). Evalúa promos estacionales para estimular la demanda.` });
    }

    // Descuentos excesivos
    if (pctDesc > 15) {
      insights.push({ type:'negative', icon:'⚠️', text:`Los descuentos representan el <strong>${pctDesc.toFixed(1)}% del ingreso bruto</strong>. Esto supera el 15% recomendado. Revisa la política de descuentos.` });
    } else if (pctDesc > 0) {
      insights.push({ type:'positive', icon:'✅', text:`La tasa de descuento está en <strong>${pctDesc.toFixed(1)}%</strong>, dentro de rangos saludables.` });
    }

    // Clientes frecuentes
    const freqActivos = Object.values(freqMap).filter(c => c.count >= 3);
    if (freqActivos.length > 0) {
      insights.push({ type:'positive', icon:'🔁', text:`Hay <strong>${freqActivos.length} cliente${freqActivos.length>1?'s':''} con 3+ compras</strong>. Son candidatos ideales para programas de fidelización.` });
    }

    // Canal más rentable
    if (canales.length > 0) {
      const [topCanal, topCanalData] = canales[0];
      insights.push({ type:'info', icon:'📣', text:`<strong>${topCanal}</strong> es tu canal más rentable con ${formatCurrency(topCanalData.total)} en ventas. Analiza qué lo hace efectivo para replicarlo.` });
    }

    // Conversión de leads
    if (db.leads.length > 0 && parseInt(convRate) < 30) {
      insights.push({ type:'neutral', icon:'🎯', text:`Tasa de conversión de leads: <strong>${convRate}%</strong>. Considera mejorar el seguimiento en etapa de cotización.` });
    }

    // Ticket promedio
    const prodMaq = ventas.filter(v=>v.unidad==='Maquinaria');
    const prodCon = ventas.filter(v=>v.unidad==='Consumibles');
    if (prodMaq.length > 0 && prodCon.length > 0) {
      const ratioMaqCon = (prodMaq.reduce((a,b)=>a+b.total,0) / totalBruto * 100).toFixed(0);
      insights.push({ type:'info', icon:'⚖️', text:`Maquinaria representa el <strong>${ratioMaqCon}% del ingreso total</strong>. Consumibles aportan recurrencia mientras Maquinaria impulsa el volumen.` });
    }
  }

  document.getElementById('an-insights').innerHTML = `<div class="insights-grid">${
    insights.map(i => `<div class="insight-card ${i.type}">
      <div class="insight-icon">${i.icon}</div>
      <div class="insight-text">${i.text}</div>
    </div>`).join('')
  }</div>`;

  // --- VENTAS POR TIPO DE CLIENTE (NUEVO) ---
  const typeMap = {};
  ventas.forEach(v => {
    const cli = db.clientes.find(c => c.id === v.clienteId);
    const type = cli ? (cli.tipo || 'Natural') : 'Natural';
    if (!typeMap[type]) typeMap[type] = 0;
    typeMap[type] += v.total;
  });
  const typeList = Object.entries(typeMap).sort((a,b) => b[1] - a[1]);
  const typeMax = Math.max(...Object.values(typeMap), 1);
  document.getElementById('an-ventas-tipo').innerHTML = typeList.length
    ? typeList.map(([type, total]) => `<div class="bar-item">
        <div class="bar-label">${type}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(total/typeMax*100).toFixed(1)}%;background:var(--accent)"></div></div>
        <div class="bar-value">${formatCurrency(total)}</div>
      </div>`).join('')
    : '<div class="analytics-empty">Sin datos de tipos de cliente.</div>';

  // --- TOP UBICACIONES (NUEVO) ---
  const locMap = {};
  ventas.forEach(v => {
    const cli = db.clientes.find(c => c.id === v.clienteId);
    const loc = cli ? (cli.ubicacion || 'Sin especificar') : 'Sin especificar';
    if (!locMap[loc]) locMap[loc] = 0;
    locMap[loc] += v.total;
  });
  const locList = Object.entries(locMap).sort((a,b) => b[1] - a[1]).slice(0, 10);
  document.getElementById('an-top-ubicaciones').innerHTML = locList.length
    ? locList.map(([loc, total]) => `<div class="freq-item">
        <div class="freq-avatar" style="background:var(--bg-dark)">📍</div>
        <div class="freq-info">
          <div class="freq-name">${loc}</div>
          <div class="freq-meta">${formatCurrency(total)} facturados</div>
        </div>
      </div>`).join('')
    : '<div class="analytics-empty">Sin datos de ubicación.</div>';
}

function renderInventario() {
  const filterUnidad = document.getElementById('inv-filter-unidad')?.value || '';
  const search = (document.getElementById('inv-search')?.value || '').toLowerCase();
  const tbody = document.getElementById('inventario-body');

  let prods = db.productos
    .filter(p => !filterUnidad || p.unidad === filterUnidad)
    .filter(p => !search || p.nombre.toLowerCase().includes(search));

  if (!prods.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No hay productos en el inventario.</td></tr>';
    return;
  }

  tbody.innerHTML = prods.map(p => {
    const stock = p.stock || 0;
    const badge = stock > 0 ? 'ok' : 'low';
    return `<tr>
      <td><strong>${p.nombre}</strong></td>
      <td><span class="tag" style="background:${getUnitColor(p.unidad)}22; color:${getUnitColor(p.unidad)}">${p.unidad}</span></td>
      <td>${formatCurrency(p.precio)}</td>
      <td><span class="tag warning">${p.descMax || 20}%</span></td>
      <td><span class="stock-badge ${badge}" style="font-size:12px">${stock} unid.</span></td>
      <td>
        <button class="btn-primary btn-sm" onclick="openStockModal('${p.id}', '${p.nombre.replace(/'/g, "\\'")}')">Cambiar stock</button>
      </td>
    </tr>`;
  }).join('');
}

function openStockModal(id, nombre) {
  document.getElementById('stock-pid').value = id;
  document.getElementById('stock-pname').textContent = nombre;
  document.getElementById('stock-qty').value = '';
  openModal('modal-stock');
}

function guardarStock() {
  const pid = document.getElementById('stock-pid').value;
  const qty = parseInt(document.getElementById('stock-qty').value);
  if (!pid || isNaN(qty)) return showToast('Ingresa una cantidad válida.', 'error');
  
  RDB.ref('productos/' + pid + '/stock').transaction(current => (current || 0) + qty)
    .then(() => {
      closeModal('modal-stock');
      showToast('📦 Ajuste de stock exitoso.');
    });
}

function exportarInventarioCSV() {
  const prods = db.productos;
  if (!prods || prods.length === 0) {
    showToast('No hay productos para exportar.', 'warning');
    return;
  }
  
  let csvContent = "ID,Nombre,Unidad,Precio,DescMax,Descripcion,Stock\n";
  
  prods.forEach(p => {
    const row = [
      p.id,
      `"${(p.nombre || '').replace(/"/g, '""')}"`,
      `"${p.unidad || ''}"`,
      p.precio || 0,
      p.descMax || 20,
      `"${(p.descripcion || '').replace(/"/g, '""')}"`,
      p.stock || 0
    ];
    csvContent += row.join(",") + "\n";
  });
  
  const blob = new Blob(["\ufeff", csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `inventario_${todayStr()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function importarInventarioCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.split(/\r?\n/);
    if (lines.length < 1) return;

    // Detectar separador por la primera línea
    const firstLine = lines[0];
    const separator = (firstLine.includes(';') && (firstLine.split(';').length > firstLine.split(',').length)) ? ';' : ',';

    let imported = 0;
    let errors = 0;
    
    const startIdx = (firstLine.toLowerCase().includes('nombre') || firstLine.toLowerCase().includes('unidad')) ? 1 : 0;
    const updates = {};
    
    for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Regex para manejar el separador detectado y posibles comillas
        const regex = new RegExp(`${separator}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
        const columns = line.split(regex);
        
        const cleanCol = (col) => {
            if (!col) return '';
            let c = col.trim();
            if (c.startsWith('"') && c.endsWith('"')) {
                c = c.slice(1, -1);
            }
            return c.replace(/""/g, '"');
        };
        
        const idCol = cleanCol(columns[0]);
        const nombreCol = cleanCol(columns[1]);
        const unidadCol = cleanCol(columns[2]);
        const precioCol = cleanCol(columns[3]);
        const descMaxCol = cleanCol(columns[4]);
        const descCol = cleanCol(columns[5]);
        const stockCol = cleanCol(columns[6]);
        
        if (nombreCol && unidadCol && precioCol) {
            const pid = idCol || uid();
            updates['productos/' + pid] = {
                id: pid,
                nombre: nombreCol,
                unidad: unidadCol,
                precio: parseFloat(precioCol.replace(',', '.')) || 0,
                descMax: parseFloat(descMaxCol) || 20,
                descripcion: descCol,
                stock: parseInt(stockCol) || 0
            };
            imported++;
        } else {
            console.warn("Línea omitida por datos incompletos:", line);
            errors++;
        }
    }
    
    if (Object.keys(updates).length > 0) {
        RDB.ref('/').update(updates)
            .then(() => {
                showToast(`✅ CSV Importado: ${imported} productos. ${errors > 0 ? errors + ' líneas con errores omitidas.' : ''}`);
                event.target.value = '';
                // Forzar repoblamiento de unidades
                setTimeout(() => populateUnitSelects(), 500);
            })
            .catch(err => {
                showToast('Error al guardar datos', 'error');
                console.error(err);
                event.target.value = '';
            });
    } else {
        showToast('No se encontraron datos válidos en el CSV. Verifica el formato.', 'error');
        event.target.value = '';
    }
  };
  reader.readAsText(file);
}

function exportarClientesCSV() {
  if (!db.clientes.length) return showToast('No hay clientes para exportar.', 'warning');
  const data = db.clientes.map(c => ({
    Nombre: c.nombre,
    Identificacion: c.identificacion || '',
    Telefono: c.telefono,
    Email: c.email || '',
    Ubicacion: c.ubicacion || '',
    Tipo: c.tipo || 'Natural',
    Fuente: c.fuente || '',
    Notas: (c.notas || '').replace(/;/g, ',')
  }));
  downloadCSV(data, 'Maestro_Clientes');
}

function importarClientesCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return showToast('El archivo está vacío o no tiene cabeceras.', 'error');

    const firstLine = lines[0];
    const separator = (firstLine.includes(';') && (firstLine.split(';').length > firstLine.split(',').length)) ? ';' : ',';
    
    let imported = 0;
    const updates = {};
    const startIdx = 1; // Asumimos siempre cabeceras

    for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const regex = new RegExp(`${separator}(?=(?:(?:[^"]*"){2})*[^"]*$)`);
        const columns = line.split(regex);
        
        const cleanCol = (col) => {
            if (!col) return '';
            let c = col.trim();
            if (c.startsWith('"') && c.endsWith('"')) c = c.slice(1, -1);
            return c.replace(/""/g, '"');
        };

        const nombre = cleanCol(columns[0]);
        if (nombre) {
            const cid = uid();
            updates['clientes/' + cid] = {
                id: cid,
                nombre,
                identificacion: cleanCol(columns[1]),
                telefono: cleanCol(columns[2]),
                email: cleanCol(columns[3]),
                ubicacion: cleanCol(columns[4]),
                tipo: cleanCol(columns[5]) || 'Natural',
                fuente: cleanCol(columns[6]) || 'Otro',
                notas: cleanCol(columns[7])
            };
            imported++;
        }
    }

    if (imported > 0) {
        RDB.ref('/').update(updates).then(() => {
            showToast(`✅ Importados ${imported} clientes exitosamente.`);
            event.target.value = '';
        });
    } else {
        showToast('No se encontraron clientes válidos.', 'error');
        event.target.value = '';
    }
  };
  reader.readAsText(file);
}

// ─── INIT ─────────────────────────────────────────────────────
function init() {
  populateUnitSelects();

  // Preview de Imagen de Producto
  const pImgInput = document.getElementById('p-imagen');
  if (pImgInput) {
    pImgInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      const preview = document.getElementById('p-preview');
      if (file && preview) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          preview.src = ev.target.result;
          preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Preview de Imagen por URL
  const pUrlInput = document.getElementById('p-imagen-url');
  if (pUrlInput) {
    pUrlInput.addEventListener('input', function(e) {
      const url = e.target.value.trim();
      const preview = document.getElementById('p-preview');
      if (url && preview) {
        preview.src = url;
        preview.style.display = 'block';
      } else if (!document.getElementById('p-imagen').files[0]) {
        preview.src = '';
        preview.style.display = 'none';
      }
    });
  }
  // Set today's date in topbar
  const now = new Date();
  document.getElementById('topbar-date').textContent = now.toLocaleDateString('es-VE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Reset forms on modal open
  document.getElementById('modal-venta').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-venta')) closeModal('modal-venta');
  });

  populateSelects();
  resetVentaForm();
  updateReminderBadge();

  // Render initial page
  renderDashboard();

  // Setup keyboard shortcut
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
    }
  });
}

// Intercept modal open to reset forms
const origOpenModal = openModal;
window.openModal = function(id) {
  if (id === 'modal-venta' && !document.getElementById('v-id').value) resetVentaForm();
  if (id === 'modal-lead' && !document.getElementById('l-id').value) resetLeadForm();
  if (id === 'modal-producto' && !document.getElementById('p-id').value) resetProductoForm();
  if (id === 'modal-vendedor' && !document.getElementById('vend-id').value) resetVendedorForm();
  if (id === 'modal-cliente' && !document.getElementById('cli-id').value) resetClienteForm();
  origOpenModal(id);
};

// ─── REPORTES / EXPORTACIÓN ──────────────────────────────────
function downloadCSV(rows, filename) {
  if (!rows || !rows.length) {
    if (typeof showToast === 'function') showToast('No hay datos para exportar', 'warning');
    else alert('No hay datos para exportar');
    return;
  }
  
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(';'),
    ...rows.map(row => headers.map(h => {
      let val = row[h] === null || row[h] === undefined ? '' : row[h];
      val = val.toString().replace(/;/g, ',').replace(/\n/g, ' ');
      return `"${val}"`;
    }).join(';'))
  ].join('\n');

  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportarReporteVentas() {
  const flattenedData = [];
  
  db.ventas.forEach(v => {
    const cli = db.clientes.find(c => c.id === v.clienteId);
    const vend = db.vendedores.find(vend => vend.id === v.vendedorId);
    const common = {
      IdVenta: v.id,
      Fecha: v.fecha,
      Cliente: cli ? cli.nombre : (v.clienteNombre || 'Desconocido'),
      Vendedor: vend ? vend.nombre : (v.vendedorNombre || 'Desconocido'),
      UnidadNegocio: v.unidad,
      Fuente: v.fuente || 'Directo',
      DescGlobalPct: v.descuentoPct || 0,
      Notas: (v.notas || '').replace(/;/g, ',')
    };

    if (v.items && v.items.length > 0) {
      v.items.forEach(item => {
        flattenedData.push({
          ...common,
          Producto: item.nombre,
          Cantidad: item.cantidad,
          PrecioUn: item.precioUn,
          SubtotalItem: item.total,
          TotalVenta: v.total
        });
      });
    } else {
      // Legacy support
      flattenedData.push({
        ...common,
        Producto: v.productoNombre || 'Desconocido',
        Cantidad: v.cantidad || 1,
        PrecioUn: v.precioFinal || v.precioBase || 0,
        SubtotalItem: v.total,
        TotalVenta: v.total
      });
    }
  });

  downloadCSV(flattenedData, 'Reporte_Ventas_Maestro');
}

function exportarReporteLeads() {
  const data = db.leads.map(l => {
    const vend = db.vendedores.find(v => v.id === l.vendedorId);
    return {
      Nombre: l.nombre,
      Telefono: l.telefono || '',
      Email: l.email || '',
      Fuente: l.fuente,
      Unidad: l.unidad || 'N/A',
      Etapa: l.etapa,
      Vendedor: vend ? vend.nombre : 'Sin asignar',
      'Motivo de Pérdida': l.razonPerdida || '',
      'Obs. de Pérdida': l.obsPerdida || '',
      Notas: l.notas || ''
    };
  });
  downloadCSV(data, 'Reporte_Leads');
}

function exportarReporteVendedores() {
  const data = db.vendedores.map(v => {
    const vVentas = db.ventas.filter(sale => sale.vendedorId === v.id);
    const total = vVentas.reduce((sum, s) => sum + (s.precioFinal * s.cantidad), 0);
    return {
      Vendedor: v.nombre,
      'Total Ventas #': vVentas.length,
      'Monto Total $': total.toFixed(2),
      'Ticket Promedio': vVentas.length ? (total / vVentas.length).toFixed(2) : 0,
      Unidades: v.unidades ? v.unidades.join(', ') : 'N/A'
    };
  });
  downloadCSV(data, 'Reporte_Vendedores');
}

function exportarReporteProductos() {
  const data = db.productos.map(p => {
    const pVentas = db.ventas.filter(v => v.productoId === p.id);
    const total = pVentas.reduce((sum, v) => sum + (v.precioFinal * v.cantidad), 0);
    const qty = pVentas.reduce((sum, v) => sum + v.cantidad, 0);
    return {
      Producto: p.nombre,
      Unidad: p.unidad,
      Precio: p.precio,
      'Unidades Vendidas': qty,
      'Ingresos Totales $': total.toFixed(2),
      Stock: p.stock || 0
    };
  });
  downloadCSV(data, 'Reporte_Productos');
}

// ─── TAREAS MODULE ──────────────────────────────────────────
function renderTareas() {
  populateSelects();
  const filterEstado = document.getElementById('tar-filter-estado')?.value || '';
  const filterVendedor = document.getElementById('tar-filter-vendedor')?.value || '';
  
  const colVencidas = document.getElementById('col-tareas-vencidas');
  const colHoy = document.getElementById('col-tareas-hoy');
  const colListas = document.getElementById('col-tareas-listas');
  
  colVencidas.innerHTML = '';
  colHoy.innerHTML = '';
  colListas.innerHTML = '';
  
  let tareas = db.tareas.filter(t => {
    if (filterEstado && t.estado !== filterEstado) return false;
    if (filterVendedor && t.vendedorId !== filterVendedor) return false;
    return true;
  });

  let counts = { vencidas: 0, hoy: 0, listas: 0 };

  tareas.sort((a,b) => new Date(a.fecha) - new Date(b.fecha)).forEach(t => {
    const diff = daysUntil(t.fecha);
    const card = document.createElement('div');
    card.className = `task-card ${t.estado === 'completada' ? 'completada' : (diff < 0 ? 'vencida' : '')}`;
    
    let vinculoText = '—';
    if (t.vinculoId) {
      const [type, id] = t.vinculoId.split(':');
      const obj = type === 'lead' ? db.leads.find(l => l.id === id) : db.clientes.find(c => c.id === id);
      vinculoText = obj ? obj.nombre : 'Relación eliminada';
    }

    card.innerHTML = `
      <div class="task-title">${t.titulo}</div>
      <div class="task-meta">
        <span>📅 ${formatDate(t.fecha)} (${diff === 0 ? 'Hoy' : (diff < 0 ? 'Vencida' : 'en ' + diff + ' días')})</span>
        <span>👥 Asignada a: ${t.vendedorNombre || '—'}</span>
        <span>🔗 Vinculo: ${vinculoText}</span>
      </div>
      <div class="task-actions">
        ${t.estado === 'pendiente' ? `<button class="btn-primary btn-sm" onclick="completarTarea('${t.id}')">Concluir</button>` : ''}
        <button class="btn-ghost btn-sm" onclick="eliminarTarea('${t.id}')">✕</button>
      </div>
    `;

    if (t.estado === 'completada') {
      colListas.appendChild(card);
      counts.listas++;
    } else if (diff < 0) {
      colVencidas.appendChild(card);
      counts.vencidas++;
    } else {
      colHoy.appendChild(card);
      counts.hoy++;
    }
  });

  document.getElementById('count-tareas-vencidas').textContent = counts.vencidas;
  document.getElementById('count-tareas-hoy').textContent = counts.hoy;
  document.getElementById('count-tareas-listas').textContent = counts.listas;
}

function resetTareaForm() {
  document.getElementById('tar-id').value = '';
  document.getElementById('tar-titulo').value = '';
  document.getElementById('tar-fecha').value = todayStr();
  document.getElementById('tar-vendedor').value = '';
  document.getElementById('tar-vinculo').value = '';
}

function guardarTarea() {
  const titulo = document.getElementById('tar-titulo').value.trim();
  const fecha = document.getElementById('tar-fecha').value;
  const vendedorId = document.getElementById('tar-vendedor').value;
  const vinculoId = document.getElementById('tar-vinculo').value;

  if (!titulo || !fecha || !vendedorId) return showToast('Completa los campos obligatorios.', 'error');

  const vend = db.vendedores.find(v => v.id === vendedorId);
  const t = {
    id: uid(),
    titulo,
    fecha,
    vendedorId,
    vendedorNombre: vend ? vend.nombre : '—',
    vinculoId,
    estado: 'pendiente',
    createdAt: new Date().toISOString()
  };

  RDB.ref('tareas/' + t.id).set(t).then(() => {
    closeModal('modal-tarea');
    showToast('✅ Tarea agendada correctamente.');
    resetTareaForm();
  });
}

function completarTarea(id) {
  RDB.ref('tareas/' + id + '/estado').set('completada')
    .then(() => showToast('✅ Tarea completada. 🎉'));
}

function eliminarTarea(id) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  RDB.ref('tareas/' + id).remove()
    .then(() => showToast('Tarea eliminada.', 'warning'));
}

// ─── PDF GENERATION ──────────────────────────────────────────
function generarCotizacionDeVenta() {
  const clienteId = document.getElementById('v-cliente').value;
  const vendedorId = document.getElementById('v-vendedor').value;
  const pctGlobal = parseFloat(document.getElementById('v-descuento').value) || 0;

  if (!clienteId || !currentCart.length) {
    return showToast('Selecciona un cliente y productos para la cotización.', 'warning');
  }

  const cliente = db.clientes.find(c => c.id === clienteId);
  const vendedor = db.vendedores.find(v => v.id === vendedorId);

  // Llenar template
  document.getElementById('inv-fecha').textContent = `Fecha: ${formatDate(todayStr())}`;
  document.getElementById('inv-cliente-nombre').textContent = cliente ? cliente.nombre : 'Cliente';
  document.getElementById('inv-cliente-tel').textContent = cliente ? `Tel: ${cliente.telefono || '—'}` : '';
  document.getElementById('inv-vendedor').textContent = vendedor ? vendedor.nombre : 'Sin asignar';

  const subtotal = currentCart.reduce((sum, item) => sum + item.total, 0);
  const totalDesc = subtotal * (pctGlobal / 100);
  const totalFinal = subtotal - totalDesc;

  document.getElementById('inv-items').innerHTML = currentCart.map(item => `
    <tr class="item">
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        <strong>${item.nombre}</strong><br>
        <span style="font-size:11px; color:#777;">Unidad: ${item.unidad}</span>
      </td>
      <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">${item.cantidad}</td>
      <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${formatCurrency(item.precioUn)}</td>
      <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${formatCurrency(item.total)}</td>
    </tr>
  `).join('');

  document.getElementById('inv-subtotal').textContent = formatCurrency(subtotal);
  document.getElementById('inv-desc-pct').textContent = pctGlobal;
  document.getElementById('inv-desc-amt').textContent = '- ' + formatCurrency(totalDesc);
  document.getElementById('inv-total').textContent = formatCurrency(totalFinal);

  // Generar PDF
  const element = document.getElementById('invoice-pdf');
  const opt = {
    margin:       10,
    filename:     `Cotizacion_${cliente.nombre.replace(/\s+/g, '_')}_${todayStr()}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(element).save();
  showToast('📄 Preparando descarga de Cotización...');
}
