import { doc, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

/** Dashboard aislado: no modifica la lógica del catálogo ni requiere dependencias visuales. */
export function createAdminDashboard({ db, notify, refresh }) {
  const view = document.querySelector('#vista-admin');
  let authorized = false;
  let products = [];
  let page = 0;
  const pageSize = 10;
  const $ = id => document.getElementById(id);
  const number = value => Math.max(0, Number(value) || 0);
  const format = value => number(value).toLocaleString('es-CL');
  const cell = (tr, value) => {
    const td = document.createElement('td');
    td.textContent = String(value);
    tr.append(td);
    return td;
  };
  const empty = text => {
    const element = document.createElement('p');
    element.className = 'admin-empty';
    element.textContent = text;
    return element;
  };

  const TAB_NAMES = {
    resumen: 'Resumen Ejecutivo',
    inventario: 'Control de Inventario',
    actividad: 'Indicadores de Actividad'
  };

  const drawer = $('admin-drawer');
  const overlay = $('admin-drawer-overlay');
  const toggleBtn = $('admin-menu-toggle');
  const closeBtn = $('admin-drawer-close');

  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add('is-open');
    if (overlay) overlay.classList.add('is-open');
    if (toggleBtn) {
      toggleBtn.classList.add('is-active');
      toggleBtn.setAttribute('aria-expanded', 'true');
    }
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-drawer-open');
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('is-open');
    if (overlay) overlay.classList.remove('is-open');
    if (toggleBtn) {
      toggleBtn.classList.remove('is-active');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-drawer-open');
  }

  function toggleDrawer() {
    if (drawer && drawer.classList.contains('is-open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function setAuthorized(value) {
    authorized = Boolean(value);
    if (!authorized) {
      closeDrawer();
      products = [];
      view.querySelectorAll('[id^="admin-kpi-"]').forEach(el => { el.textContent = '0'; });
      $('admin-tabla-body').replaceChildren();
      $('admin-alertas').replaceChildren();
      $('admin-ranking').replaceChildren();
      if ($('admin-drawer-badge-criticos')) $('admin-drawer-badge-criticos').textContent = '0';
      if ($('admin-drawer-badge-total')) $('admin-drawer-badge-total').textContent = '0';
    }
  }

  function showTab(tab) {
    view.querySelectorAll('[data-admin-panel]').forEach(section => {
      section.hidden = section.dataset.adminPanel !== tab;
    });
    view.querySelectorAll('[data-admin-tab]').forEach(button => {
      const active = button.dataset.adminTab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    const sectionText = $('admin-current-section-text');
    if (sectionText && TAB_NAMES[tab]) {
      sectionText.textContent = TAB_NAMES[tab];
    }
  }

  function renderSummary() {
    const lowCount = products.filter(p => number(p.stock) <= 5).length;
    $('admin-kpi-productos').textContent = format(products.length);
    $('admin-kpi-stock').textContent = format(products.reduce((sum, p) => sum + number(p.stock), 0));
    $('admin-kpi-criticos').textContent = format(lowCount);
    $('admin-kpi-ventas').textContent = format(products.reduce((sum, p) => sum + number(p.ventasMes), 0));
    $('admin-kpi-interes').textContent = format(products.reduce((sum, p) => sum + number(p.deseabilidad), 0));
    $('admin-kpi-abandonos').textContent = format(products.reduce((sum, p) => sum + number(p.abandonosCarro), 0));

    const badgeCriticos = $('admin-drawer-badge-criticos');
    if (badgeCriticos) {
      badgeCriticos.textContent = format(lowCount);
      badgeCriticos.style.display = lowCount > 0 ? 'inline-flex' : 'none';
    }
    const badgeTotal = $('admin-drawer-badge-total');
    if (badgeTotal) {
      badgeTotal.textContent = format(products.length);
    }

    const alerts = $('admin-alertas');
    alerts.replaceChildren();
    const low = products.filter(p => number(p.stock) <= 5)
      .sort((a, b) => number(a.stock) - number(b.stock)).slice(0, 7);
    if (!low.length) alerts.append(empty('No hay productos con stock bajo.'));
    for (const p of low) {
      const row = document.createElement('div');
      row.className = 'admin-list-row';
      const text = document.createElement('span');
      text.textContent = `${p.nombre || 'Sin nombre'} · ${p.sku || 'Sin SKU'}`;
      const badge = document.createElement('strong');
      badge.className = number(p.stock) === 0 ? 'admin-pill danger' : 'admin-pill warning';
      badge.textContent = `${format(p.stock)} unid.`;
      row.append(text, badge);
      alerts.append(row);
    }
    const ranking = $('admin-ranking');
    ranking.replaceChildren();
    const sorted = [...products].sort((a, b) => number(b.deseabilidad) - number(a.deseabilidad)).slice(0, 7);
    if (!sorted.length) ranking.append(empty('Todavía no hay productos registrados.'));
    for (const [index, p] of sorted.entries()) {
      const row = document.createElement('div');
      row.className = 'admin-list-row';
      const text = document.createElement('span');
      text.textContent = `${index + 1}. ${p.nombre || 'Sin nombre'}`;
      const value = document.createElement('strong');
      value.textContent = `${format(p.deseabilidad)} interacciones`;
      row.append(text, value);
      ranking.append(row);
    }
  }

  function filtered() {
    const search = $('admin-search').value.trim().toLocaleLowerCase('es');
    const status = $('admin-stock-filter').value;
    const sort = $('admin-sort').value;
    const list = products.filter(p => {
      const matches = `${p.nombre || ''} ${p.sku || ''}`.toLocaleLowerCase('es').includes(search);
      const stock = number(p.stock);
      return matches && (status === 'todos' ||
        (status === 'bajo' && stock <= 5) ||
        (status === 'agotado' && stock === 0) ||
        (status === 'disponible' && stock > 0));
    });
    list.sort((a, b) => {
      if (sort === 'stock') return number(a.stock) - number(b.stock);
      if (sort === 'ventas') return number(b.ventasMes) - number(a.ventasMes);
      if (sort === 'interes') return number(b.deseabilidad) - number(a.deseabilidad);
      return (a.nombre || '').localeCompare(b.nombre || '', 'es');
    });
    return list;
  }

  function renderTable() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    page = Math.min(page, pages - 1);
    $('admin-total-visible').textContent = `${format(list.length)} resultados`;
    const tbody = $('admin-tabla-body');
    tbody.replaceChildren();
    for (const p of list.slice(page * pageSize, (page + 1) * pageSize)) {
      const tr = document.createElement('tr');
      cell(tr, p.sku || '—');
      cell(tr, p.nombre || 'Producto sin nombre');
      const stock = cell(tr, `${format(p.stock)} unid.`);
      stock.className = number(p.stock) === 0 ? 'admin-stock-zero' : number(p.stock) <= 5 ? 'admin-stock-low' : 'admin-stock-ok';
      cell(tr, format(p.deseabilidad));
      cell(tr, format(p.ventasMes));
      cell(tr, format(p.abandonosCarro));
      const actions = document.createElement('td');
      actions.className = 'admin-actions';
      for (const amount of [5, 10]) {
        const button = document.createElement('button');
        button.className = 'admin-btn admin-add';
        button.textContent = `+${amount}`;
        button.title = `Sumar ${amount} unidades al inventario`;
        button.disabled = !p.id;
        button.addEventListener('click', () => restock(p, amount, button));
        actions.append(button);
      }
      tr.append(actions);
      tbody.append(tr);
    }
    if (!list.length) {
      const tr = document.createElement('tr');
      const td = cell(tr, 'No encontramos productos que coincidan con los filtros.');
      td.colSpan = 7;
      td.className = 'admin-empty-cell';
      tbody.append(tr);
    }
    $('admin-pagination-info').textContent = `${list.length ? page * pageSize + 1 : 0}–${Math.min((page + 1) * pageSize, list.length)} de ${list.length}`;
    $('admin-prev').disabled = page === 0;
    $('admin-next').disabled = page >= pages - 1;
  }

  async function restock(product, amount, button) {
    if (!authorized || !product.id || !Number.isInteger(amount) || amount <= 0) return;
    const accepted = window.confirm(`¿Confirmas agregar ${amount} unidades a "${product.nombre || product.sku}"?`);
    if (!accepted) return;
    button.disabled = true;
    try {
      await updateDoc(doc(db, 'productos', product.id), { stock: increment(amount) });
      notify(`Se agregaron ${amount} unidades al inventario.`, 'exito');
      await refresh();
    } catch (error) {
      console.error('Reposición fallida:', error);
      notify('No se pudo actualizar el inventario. Verifica los permisos de Firestore.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  function render(inventory) {
    if (!authorized) return;
    products = Array.isArray(inventory) ? inventory : [];
    renderSummary();
    renderTable();
  }

  if (toggleBtn) toggleBtn.addEventListener('click', toggleDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (overlay) overlay.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer && drawer.classList.contains('is-open')) {
      closeDrawer();
    }
  });

  $('admin-refresh')?.addEventListener('click', () => {
    if (authorized) {
      refresh();
      closeDrawer();
    }
  });

  view.querySelectorAll('[data-admin-tab]').forEach(button => {
    button.addEventListener('click', () => {
      showTab(button.dataset.adminTab);
      closeDrawer();
    });
  });

  for (const id of ['admin-search', 'admin-stock-filter', 'admin-sort']) {
    $(id).addEventListener(id === 'admin-search' ? 'input' : 'change', () => { page = 0; renderTable(); });
  }
  $('admin-prev').addEventListener('click', () => { page = Math.max(0, page - 1); renderTable(); });
  $('admin-next').addEventListener('click', () => { page++; renderTable(); });
  showTab('resumen');
  return { render, setAuthorized, openDrawer, closeDrawer };
}
