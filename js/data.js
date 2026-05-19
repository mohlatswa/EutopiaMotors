// ── EUTOPIA MOTORS — SUPABASE DATA LAYER ─────────────────────────────────────

const SUPABASE_URL = 'https://uwxnbaicwfbygvkiyhcf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3eG5iYWljd2ZieWd2a2l5aGNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzEwOTEsImV4cCI6MjA4ODc0NzA5MX0.eEf8iGPW43yPyt2tQU9W2r3rzLwXmGhVMtyNrgMXy5Y';

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Normalize DB row: date_added (snake_case from postgres) → dateAdded (camelCase used in HTML)
function _norm(c) {
  if (!c) return null;
  if (c.date_added && !c.dateAdded) c.dateAdded = c.date_added;
  return c;
}

const DB = {
  async getCars() {
    const { data, error } = await _sb.from('cars').select('*').order('date_added', { ascending: false });
    if (error) { console.error('getCars:', error); return []; }
    return (data || []).map(_norm);
  },
  async getCar(id) {
    const { data, error } = await _sb.from('cars').select('*').eq('id', id).maybeSingle();
    if (error) { console.error('getCar:', error); return null; }
    return _norm(data);
  },
  async addCar(car) {
    const payload = { ...car };
    if (!payload.id) payload.id = 'EM' + String(Date.now()).slice(-6);
    payload.date_added = new Date().toISOString().slice(0, 10);
    delete payload.dateAdded;
    const { data, error } = await _sb.from('cars').insert(payload).select().single();
    if (error) { console.error('addCar:', error); showToast('Failed to save car: ' + error.message, 'error'); return null; }
    return _norm(data);
  },
  async updateCar(id, updates) {
    const payload = { ...updates };
    if (payload.dateAdded) { payload.date_added = payload.dateAdded; delete payload.dateAdded; }
    const { error } = await _sb.from('cars').update(payload).eq('id', id);
    if (error) { console.error('updateCar:', error); showToast('Update failed: ' + error.message, 'error'); }
  },
  async deleteCar(id) {
    const { error } = await _sb.from('cars').delete().eq('id', id);
    if (error) { console.error('deleteCar:', error); showToast('Delete failed: ' + error.message, 'error'); }
  },
  async getSellRequests() {
    const { data, error } = await _sb.from('sell_requests').select('*').order('created_at', { ascending: false });
    if (error) { console.error('getSR:', error); return []; }
    return data || [];
  },
  async addSellRequest(req) {
    const payload = { ...req };
    payload.id = 'SR' + Date.now();
    payload.date = new Date().toISOString().slice(0, 10);
    payload.status = 'pending';
    const { data, error } = await _sb.from('sell_requests').insert(payload).select().single();
    if (error) { console.error('addSR:', error); return payload; }
    return data;
  },
  async updateSellRequest(id, updates) {
    const { error } = await _sb.from('sell_requests').update(updates).eq('id', id);
    if (error) { console.error('updateSR:', error); }
  },
  async getStats() {
    const [carsRes, srRes] = await Promise.all([
      _sb.from('cars').select('status,featured'),
      _sb.from('sell_requests').select('id', { count: 'exact', head: true })
    ]);
    const cars = carsRes.data || [];
    return {
      total: cars.length,
      available: cars.filter(c => c.status === 'available').length,
      sold: cars.filter(c => c.status === 'sold').length,
      sellRequests: srRes.count || 0,
      featured: cars.filter(c => c.featured).length
    };
  },
  async uploadCarImage(file, carId) {
    const ext = file.name.split('.').pop().toLowerCase();
    const path = `${carId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await _sb.storage.from('car-images').upload(path, file, { upsert: true });
    if (error) { console.error('uploadCarImage:', error); return null; }
    return _sb.storage.from('car-images').getPublicUrl(path).data.publicUrl;
  },
  async uploadCarDoc(file, carId, docType) {
    const ext = file.name.split('.').pop().toLowerCase();
    const path = `${carId}/${docType}.${ext}`;
    const { error } = await _sb.storage.from('car-docs').upload(path, file, { upsert: true });
    if (error) { console.error('uploadCarDoc:', error); return null; }
    return _sb.storage.from('car-docs').getPublicUrl(path).data.publicUrl;
  },
  async signIn(email, password) {
    return await _sb.auth.signInWithPassword({ email, password });
  },
  async signOut() {
    return await _sb.auth.signOut();
  },
  async getUser() {
    const { data: { user } } = await _sb.auth.getUser();
    return user;
  }
};

// ── Utility Functions ─────────────────────────────────────────────────────────
function formatPrice(price) {
  return 'R ' + Number(price).toLocaleString('en-ZA');
}
function formatMileage(km) {
  return Number(km).toLocaleString('en-ZA') + ' km';
}
function getCarTitle(car) {
  return `${car.year} ${car.make} ${car.model}`;
}
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  t.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100px)'; setTimeout(() => t.remove(), 300); }, 3500);
}
function buildCarCard(car, link = 'car-detail.html') {
  const statusLabel = car.status === 'sold' ? 'SOLD' : (car.featured ? 'Featured' : (car.condition === 'new' ? 'NEW' : ''));
  const badgeClass = car.status === 'sold' ? 'sold' : (car.featured ? 'featured' : 'new');
  return `
  <div class="car-card" onclick="window.location='${link}?id=${car.id}'">
    <div class="car-card-img">
      <img src="${car.image}" alt="${getCarTitle(car)}" loading="lazy" onerror="this.src='https://placehold.co/800x500/0A1628/ffffff?text=No+Image'">
      ${statusLabel ? `<span class="car-badge ${badgeClass}">${statusLabel}</span>` : ''}
      <button class="car-fav" onclick="event.stopPropagation(); toggleFav('${car.id}', this)" title="Save">🤍</button>
    </div>
    <div class="car-card-body">
      <div class="car-card-title">${getCarTitle(car)}</div>
      <div class="car-card-sub">${car.color} · ${car.province}</div>
      <div class="car-card-price">${formatPrice(car.price)}</div>
      <div class="car-card-specs">
        <span class="spec-tag">🛣️ ${formatMileage(car.mileage)}</span>
        <span class="spec-tag">⚙️ ${car.transmission}</span>
        <span class="spec-tag">⛽ ${car.fuel}</span>
      </div>
      <div class="car-card-footer">
        <a class="btn btn-outline btn-sm" href="${link}?id=${car.id}" onclick="event.stopPropagation()">View Details</a>
        <a class="btn btn-primary btn-sm" href="sell.html" onclick="event.stopPropagation()">Finance</a>
      </div>
    </div>
  </div>`;
}
function toggleFav(id, btn) {
  const favs = JSON.parse(localStorage.getItem('eutopia_favs') || '[]');
  const idx = favs.indexOf(id);
  if (idx === -1) { favs.push(id); btn.textContent = '❤️'; showToast('Added to favourites', 'success'); }
  else { favs.splice(idx, 1); btn.textContent = '🤍'; showToast('Removed from favourites', 'info'); }
  localStorage.setItem('eutopia_favs', JSON.stringify(favs));
}
