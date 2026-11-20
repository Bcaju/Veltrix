
let authMode = 'login';
let currentUser = null;
let pendingAuthAction = null;

function openAuth(mode) {
  authMode = mode;
  const reg = mode === 'register';

  document.getElementById('authBackdrop').classList.add('show');
  document.getElementById('authTitle').textContent = reg ? 'Бүртгүүлэх' : 'Нэвтрэх';
  document.getElementById('authDescription').textContent = reg
    ? 'VELTRIX-ийн хэрэглэгчийн бүртгэл үүсгэх мэдээллээ оруулна уу.'
    : 'Бүртгэлтэй бол утасны дугаар, нууц үгээ оруулна уу.';

  document.getElementById('nameField').hidden = !reg;
  document.getElementById('confirmField').hidden = !reg;
  document.getElementById('authName').required = reg;
  document.getElementById('authConfirm').required = reg;
  document.getElementById('authPassword').minLength = 8;
  document.getElementById('authConfirm').minLength = 8;
  document.getElementById('authSubmit').textContent = reg ? 'Бүртгүүлэх' : 'Нэвтрэх';

  document.getElementById('authSwitch').innerHTML = reg
    ? "Бүртгэлтэй юу? <button type='button' onclick=\"openAuth('login')\">Нэвтрэх</button>"
    : "Бүртгэлгүй юу? <button type='button' onclick=\"openAuth('register')\">Бүртгүүлэх</button>";

  document.getElementById('authNote').classList.remove('show');
}

function closeAuth() {
  document.getElementById('authBackdrop').classList.remove('show');
}

function backdropClose(e) {
  if (e.target.id === 'authBackdrop') closeAuth();
}

function updateHeaderAuth() {
  const authActions = document.getElementById('authActions');
  const userActions = document.getElementById('userActions');
  const userName = document.getElementById('headerUserName');
  const profileImage = document.getElementById('headerProfileImage');
  const placeholder = document.getElementById('headerProfilePlaceholder');

  if (!authActions || !userActions) return;

  authActions.hidden = !!currentUser;
  userActions.hidden = !currentUser;

  if (profileImage && placeholder) {
    const image = currentUser?.profileImage || '';

    profileImage.src = image;
    profileImage.hidden = !image;
    placeholder.hidden = !!image;
  }

  if (userName) {
    userName.setAttribute(
      'aria-label',
      currentUser ? `${currentUser.name} хэрэглэгчийн цэс` : 'Хэрэглэгчийн цэс'
    );
  }
}

async function refreshAuth() {
  try {
    const response = await fetch('/api/auth/me', { cache: 'no-store' });
    if (!response.ok) {
      currentUser = null;
      updateHeaderAuth();
      return null;
    }
    const data = await response.json();
    currentUser = data.user;
    updateHeaderAuth();
    return currentUser;
  } catch {
    currentUser = null;
    updateHeaderAuth();
    return null;
  }
}

async function logoutUser() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    currentUser = null;
    pendingAuthAction = null;
    updateHeaderAuth();
  }
}

async function requireLogin(action) {
  const user = await refreshAuth();

  if (!user) {
    pendingAuthAction = action;
    openAuth('login');
    return false;
  }

  action();
  return true;
}

async function submitAuth(e) {
  e.preventDefault();

  const note = document.getElementById('authNote');
  const submit = document.getElementById('authSubmit');
  const phone = document.getElementById('authPhone').value.trim();
  const password = document.getElementById('authPassword').value;

  if (authMode === 'register') {
    if (password !== document.getElementById('authConfirm').value) {
      note.textContent = 'Нууц үг таарахгүй байна. Дахин шалгана уу.';
      note.classList.add('show');
      return;
    }
    if (password.length < 8) {
      note.textContent = 'Нууц үг хамгийн багадаа 8 тэмдэгт байна.';
      note.classList.add('show');
      return;
    }
  }

  submit.disabled = true;
  submit.textContent = 'Түр хүлээнэ үү...';
  note.classList.remove('show');

  try {
    const response = await fetch(
      authMode === 'register' ? '/api/auth/register' : '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          phone,
          password,
          ...(authMode === 'register'
            ? { name: document.getElementById('authName').value.trim() }
            : {})
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Алдаа гарлаа.');
    }

    currentUser = data.user;
    updateHeaderAuth();
    closeAuth();

    const action = pendingAuthAction;
    pendingAuthAction = null;
    if (action) action();

    document.getElementById('authForm').reset();
  } catch (error) {
    note.textContent = error.message;
    note.classList.add('show');
  } finally {
    submit.disabled = false;
    submit.textContent = authMode === 'register' ? 'Бүртгүүлэх' : 'Нэвтрэх';
  }
}

refreshAuth();

const readStore = (key, fallback = []) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};

const writeStore = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function renderReviews() {
  const list = readStore('veltrixReviews');
  const box = document.getElementById('reviewList');

  if (!list.length) {
    box.innerHTML = '<p class="muted">Одоогоор сэтгэгдэл алга байна.</p>';
    return;
  }

  box.innerHTML = list.slice().reverse().map(r => `
    <article class="review-card">
      <div class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
      <h3>${escapeHTML(r.name)}</h3>
      <p>${escapeHTML(r.text)}</p>
    </article>
  `).join('');
}

document.getElementById('reviewForm').addEventListener('submit', e => {
  e.preventDefault();

  const list = readStore('veltrixReviews');
  list.push({
    name: document.getElementById('reviewName').value.trim(),
    rating: Number(document.getElementById('reviewRating').value),
    text: document.getElementById('reviewText').value.trim()
  });

  writeStore('veltrixReviews', list);
  e.target.reset();
  renderReviews();
  alert('Сэтгэгдэл хадгалагдлаа. Баярлалаа!');
});

renderReviews();

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAuth();
});

// =====================================
// VELTRIX PUBLIC PRODUCT SHOP
// =====================================

let shopProducts = [];

const shopMoney = value =>
  Number(value || 0).toLocaleString("mn-MN") + " ₮";

function renderShopProducts() {
  const container = document.getElementById("shopProducts");
  const count = document.getElementById("shopCount");

  if (!container || !count) return;

  const query = document.getElementById("shopSearch").value
    .trim().toLowerCase();

  const category = document.getElementById("shopCategory").value;

  const filtered = shopProducts.filter(product => {
    const matchesName = String(product.name || "")
      .toLowerCase()
      .includes(query);

    const matchesCategory =
      !category || product.category === category;

    return matchesName && matchesCategory;
  });

  count.textContent = `${filtered.length} бараа`;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="shop-empty">
        <span>🚲</span>
        <h3>Бараа олдсонгүй</h3>
        <p>Өөр нэр эсвэл ангиллаар хайж үзнэ үү.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(product => {
    const stock = Number(product.stock || 0);
    const image = String(product.image || "");
    const safeImage = /^(https?:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(image) ? escapeHTML(image) : "";
    const available = stock > 0;

    return `
      <article class="shop-card">
        <div class="shop-image-wrap">
          ${
            safeImage
              ? `<img class="shop-image" src="${safeImage}" alt="${escapeHTML(product.name)}" loading="lazy">`
              : `<div class="shop-no-image">🚲</div>`
          }
          <span class="shop-category">${escapeHTML(product.category)}</span>
        </div>
        <div class="shop-card-body">
          <h3>${escapeHTML(product.name)}</h3>
          <p class="shop-description">${escapeHTML(product.description || "VELTRIX дугуйн сэлбэг, аксессуар.")}</p>
          <div class="shop-card-bottom">
            <strong class="shop-price">${shopMoney(product.price)}</strong>
            <span class="${available ? "shop-available" : "shop-unavailable"}">
              ${available ? `Үлдэгдэл: ${stock}` : "Дууссан"}
            </span>
            <button
              class="add-cart-button"
              type="button"
              data-add-cart="${escapeHTML(product._id)}"
              ${available ? "" : "disabled"}
            >🛒 Сагсанд нэмэх</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

async function loadShopProducts() {
  const container = document.getElementById("shopProducts");
  const count = document.getElementById("shopCount");

  if (!container || !count) return;

  try {
    const response = await fetch("/api/products", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Барааны мэдээлэл татаж чадсангүй.");
    }

    shopProducts = await response.json();

    if (!Array.isArray(shopProducts)) {
      throw new Error("Серверээс буруу мэдээлэл ирлээ.");
    }

    renderShopProducts();
    syncCartWithStock();
  } catch (error) {
    console.error("VELTRIX shop:", error);
    count.textContent = "Бараа ачаалж чадсангүй.";
    container.innerHTML = `
      <div class="shop-empty">
        <h3>Түр алдаа гарлаа</h3>
        <p>Интернэт болон серверийн холболтоо шалгаад хуудсаа дахин ачаална уу.</p>
      </div>
    `;
  }
}

document.getElementById("shopSearch")?.addEventListener(
  "input",
  renderShopProducts
);

document.getElementById("shopCategory")?.addEventListener(
  "change",
  renderShopProducts
);

loadShopProducts();

// Дэлгүүрийн барааны мэдээллийг автоматаар шинэчлэх
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadShopProducts();
});

setInterval(() => {
  if (!document.hidden) loadShopProducts();
}, 15000);

// ===== VELTRIX SHOPPING CART =====
let cart = JSON.parse(localStorage.getItem("veltrixCart") || "[]");

function saveCart() {
  localStorage.setItem("veltrixCart", JSON.stringify(cart));
}

let cartNotice = "";

function syncCartWithStock() {
  if (!Array.isArray(cart) || !Array.isArray(shopProducts)) return;

  let changed = false;
  let removed = 0;
  let adjusted = 0;

  cart = cart.filter(item => {
    const product = shopProducts.find(p => String(p._id) === String(item.id));

    if (!product || Number(product.stock) <= 0) {
      removed++;
      changed = true;
      return false;
    }

    const stock = Number(product.stock);

    if (item.quantity > stock) {
      item.quantity = stock;
      adjusted++;
      changed = true;
    }

    if (item.name !== product.name || Number(item.price) !== Number(product.price)) {
      item.name = product.name;
      item.price = Number(product.price);
      changed = true;
    }

    return true;
  });

  if (changed) {
    saveCart();

    cartNotice = removed || adjusted
      ? `Үлдэгдэл өөрчлөгдсөн тул сагсыг шинэчиллээ. Хассан: ${removed}, тоо тохируулсан: ${adjusted}.`
      : "Барааны үнэ шинэчлэгдлээ.";

    renderCart();
  }
}

function renderCart() {
  const items = document.getElementById("cartItems");
  const count = document.getElementById("cartCount");
  const total = document.getElementById("cartTotal");
  const checkout = document.getElementById("checkoutButton");

  if (!items || !count || !total || !checkout) return;

  count.textContent = `${cart.reduce((sum, item) => sum + item.quantity, 0)} бараа`;

  document.getElementById("cartBadge").textContent =
  cart.reduce((sum, item) => sum + item.quantity, 0);
  
  if (!cart.length) {
    items.innerHTML = '<p class="muted">Таны сагс хоосон байна.</p>';
  } else {
    items.innerHTML = cart.map(item => `
      <div class="cart-item">
        <div>
          <strong>${escapeHTML(item.name)}</strong>
          <p>${shopMoney(item.price)} × ${item.quantity}</p>
        </div>
        <div class="cart-actions">
          <button type="button" data-cart-action="minus" data-id="${escapeHTML(item.id)}">−</button>
          <span>${item.quantity}</span>
          <button type="button" data-cart-action="plus" data-id="${escapeHTML(item.id)}">+</button>
          <button type="button" data-cart-action="remove" data-id="${escapeHTML(item.id)}">✕</button>
        </div>
      </div>
    `).join("");
  }

  if (cartNotice) {
    items.insertAdjacentHTML("beforeend",
      `<p class="muted">${escapeHTML(cartNotice)}</p>`
    );
    cartNotice = "";
  }

  const sum = cart.reduce((value, item) => value + item.price * item.quantity, 0);
  total.textContent = shopMoney(sum);
  checkout.disabled = cart.length === 0;
}

function addToCart(productId) {
  const product = shopProducts.find(p => String(p._id) === String(productId));
  if (!product || Number(product.stock) < 1) return;

  const existing = cart.find(item => item.id === String(product._id));

  if (existing) {
    if (existing.quantity >= Number(product.stock)) {
      alert("Үлдэгдэл хүрэлцэхгүй байна.");
      return;
    }
    existing.quantity++;
  } else {
    cart.push({
      id: String(product._id),
      name: product.name,
      price: Number(product.price),
      quantity: 1
    });
  }

  saveCart();
  renderCart();
  showAddedMessage(productId);
}

function showAddedMessage(productId) {
  const button = document.querySelector(
    `[data-add-cart="${CSS.escape(String(productId))}"]`
  );

  if (!button) return;

  const card = button.closest("article") || button.parentElement;
  let message = card.querySelector(".cart-added-message");

  if (!message) {
    message = document.createElement("p");
    message.className = "cart-added-message";
    button.insertAdjacentElement("afterend", message);
  }

  message.textContent = "✓ Сагсанд нэмэгдлээ";

  if (message.hideTimer) clearTimeout(message.hideTimer);

  message.hideTimer = setTimeout(() => {
    message.remove();
  }, 2500);
}

document.getElementById("shopProducts")?.addEventListener("click", event => {
  const button = event.target.closest("[data-add-cart]");
  if (!button) return;

  const productId = button.dataset.addCart;
  requireLogin(() => addToCart(productId));
});

document.getElementById("cartItems")?.addEventListener("click", event => {
  const button = event.target.closest("[data-cart-action]");
  if (!button) return;

  const item = cart.find(row => row.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.cartAction === "plus") {
    const product = shopProducts.find(p => String(p._id) === item.id);

    if (!product || item.quantity >= Number(product.stock)) {
      alert("Үлдэгдэл хүрэлцэхгүй байна.");
      return;
    }

    item.quantity++;
  }
  if (button.dataset.cartAction === "minus") item.quantity--;
  if (button.dataset.cartAction === "remove") {
    cart = cart.filter(row => row.id !== item.id);
  }

  cart = cart.filter(row => row.quantity > 0);
  saveCart();
  renderCart();
});

renderCart();

// Floating cart toggle
const cartPanel = document.getElementById("cartPanel");
const cartToggle = document.getElementById("cartToggle");

cartToggle?.addEventListener("click", () => {
  cartPanel?.classList.toggle("cart-open");
});

document.getElementById("cartItems")?.addEventListener("click", () => {
  renderCart();
});

// ===== VELTRIX CHECKOUT SYSTEM =====
const checkoutBackdrop = document.getElementById("checkoutBackdrop");
const checkoutForm = document.getElementById("checkoutForm");
const checkoutButton = document.getElementById("checkoutButton");
const deliverySelect = document.getElementById("deliveryType");
const addressField = document.getElementById("addressField");
const orderAddress = document.getElementById("orderAddress");

function updateDeliveryField() {
  const delivery = deliverySelect.value === "delivery";
  addressField.hidden = !delivery;
  orderAddress.required = delivery;
}

checkoutButton?.addEventListener("click", () => {
  requireLogin(() => {
    checkoutBackdrop.hidden = false;
    updateDeliveryField();
  });
});

document.getElementById("closeCheckout")?.addEventListener("click", () => {
  checkoutBackdrop.hidden = true;
});

checkoutBackdrop?.addEventListener("click", event => {
  if (event.target === checkoutBackdrop) {
    checkoutBackdrop.hidden = true;
  }
});

deliverySelect?.addEventListener("change", updateDeliveryField);

checkoutForm?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!cart.length) {
    alert("Таны сагс хоосон байна.");
    return;
  }

  const submitButton = document.getElementById("submitOrder");
  const message = document.getElementById("checkoutMessage");

  submitButton.disabled = true;
  message.textContent = "Захиалгыг бүртгэж байна...";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: document.getElementById("orderName").value.trim(),
        phone: document.getElementById("orderPhone").value.trim(),
        deliveryType: deliverySelect.value,
        address: orderAddress.value.trim(),
        paymentMethod: document.getElementById("paymentMethod").value,
        note: document.getElementById("orderNote").value.trim(),
        items: cart.map(item => ({
          productId: item.id,
          quantity: item.quantity
        }))
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Захиалга бүртгэхэд алдаа гарлаа.");
    }

    alert(
      "Захиалга амжилттай!\n" +
      "Захиалгын дугаар: " + data.orderNumber +
      "\nНийт: " + Number(data.total).toLocaleString("mn-MN") + " ₮"
    );

    cart = [];
    saveCart();
    renderCart();
    checkoutForm.reset();
    updateDeliveryField();
    checkoutBackdrop.hidden = true;

  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

updateDeliveryField();

// ===== VELTRIX ORDER TRACKING =====
const orderTrackingForm = document.getElementById("orderTrackingForm");

orderTrackingForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const user = await refreshAuth();

  if (!user) {
    pendingAuthAction = () => orderTrackingForm.requestSubmit();
    openAuth("login");
    return;
  }

  const button = document.getElementById("trackOrderButton");
  const result = document.getElementById("trackingResult");

  const orderNumber = document
    .getElementById("trackingOrderNumber").value.trim().toUpperCase();

  const phone = document
    .getElementById("trackingPhone").value.trim();

  button.disabled = true;
  button.textContent = "Шалгаж байна...";
  result.innerHTML = "";

  try {
    const response = await fetch("/api/orders/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber, phone })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Захиалга олдсонгүй.");
    }

    const order = data.order;

    const date = new Date(order.createdAt).toLocaleString("mn-MN");

    const items = order.items.map(item => `
      <li>${escapeHTML(item.name)} × ${Number(item.quantity)}</li>
    `).join("");

    result.innerHTML = `
      <div class="tracking-card">
        <h3>Захиалга: ${escapeHTML(order.orderNumber)}</h3>
        <div class="tracking-status">${escapeHTML(order.status)}</div>
        <p>Огноо: ${date}</p>
        <h4>Захиалсан бараа</h4>
        <ul>${items}</ul>
        <h3>Нийт: ${shopMoney(order.total)}</h3>
      </div>
    `;
  } catch (error) {
    result.innerHTML = `
      <p class="tracking-error">${escapeHTML(error.message)}</p>
    `;
  } finally {
    button.disabled = false;
    button.textContent = "Захиалга шалгах";
  }
});

function closeAccount() {
  document.getElementById("accountBackdrop")?.classList.remove("show");
}

async function uploadProfilePhoto(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const message = document.getElementById("profilePhotoMessage");
  const preview = document.getElementById("profilePreview");
  const placeholder = document.getElementById("profilePhotoPlaceholder");

  try {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("JPG, PNG эсвэл WEBP зураг сонгоно уу.");
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Эх зургийн хэмжээ 5MB-аас бага байх ёстой.");
    }

    message.textContent = "Зургийг боловсруулж байна...";

    const image = new Image();
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Зураг уншиж чадсангүй."));
      reader.readAsDataURL(file);
    });

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Зургийг нээж чадсангүй."));
      image.src = source;
    });

    const maxSide = 512;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, "image/webp", 0.75)
    );

    if (!blob || blob.size > 700 * 1024) {
      throw new Error("Зургийг 700KB-аас бага болгож чадсангүй.");
    }

    const compressed = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Зураг боловсруулахад алдаа гарлаа."));
      reader.readAsDataURL(blob);
    });

    const response = await fetch("/api/account/photo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileImage: compressed })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Зураг хадгалахад алдаа гарлаа.");
    }

    currentUser = data.user;
    preview.src = data.user.profileImage;
    preview.hidden = false;
    placeholder.hidden = true;
    updateHeaderAuth();

    message.textContent = "Профайл зураг амжилттай хадгалагдлаа.";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    event.target.value = "";
  }
}

function toggleUserMenu() {
  const dropdown = document.getElementById("userDropdown");
  const button = document.getElementById("headerUserName");

  if (!dropdown || !button) return;

  dropdown.hidden = !dropdown.hidden;
  button.setAttribute("aria-expanded", String(!dropdown.hidden));
}

function openAccount() {
  document.getElementById("userDropdown").hidden = true;
  document.getElementById("headerUserName").setAttribute("aria-expanded", "false");

  document.getElementById("accountName").value = currentUser?.name || "";
  document.getElementById("accountPhone").value = currentUser?.phone || "";

  const preview = document.getElementById("profilePreview");
  const placeholder = document.getElementById("profilePhotoPlaceholder");

  if (currentUser?.profileImage) {
    preview.src = currentUser.profileImage;
    preview.hidden = false;
    placeholder.hidden = true;
  } else {
    preview.hidden = true;
    placeholder.hidden = false;
  }

  document.getElementById("accountBackdrop").classList.add("show");
}

async function openAccountOrders() {
  const dropdown = document.getElementById("userDropdown");
  if (dropdown) dropdown.hidden = true;

  const button = document.getElementById("headerUserName");
  if (button) button.setAttribute("aria-expanded", "false");

  document.getElementById("ordersBackdrop").classList.add("show");

  const container = document.getElementById("accountOrders");
  container.textContent = "Захиалгуудыг ачаалж байна...";

  try {
    const response = await fetch("/api/account/orders", {
      cache: "no-store"
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Захиалга авахад алдаа гарлаа.");
    }

    container.replaceChildren();

    if (!data.orders.length) {
      container.textContent = "Одоогоор захиалга байхгүй байна.";
      return;
    }

    const steps = [
      "Шинэ",
      "Баталгаажсан",
      "Бэлтгэж байна",
      "Хүргэлтэд гарсан",
      "Дууссан"
    ];

    data.orders.forEach(order => {
      const card = document.createElement("div");
      card.className = "account-order-card";

      const title = document.createElement("strong");
      title.textContent = order.orderNumber;

      const status = document.createElement("p");
      status.className = "account-order-status";
      status.textContent = "Төлөв: " + order.status;

      card.append(title, status);

      if (order.status === "Цуцалсан") {
        const cancelled = document.createElement("div");
        cancelled.className = "order-cancelled";
        cancelled.textContent = "✕ Захиалга цуцлагдсан";
        card.appendChild(cancelled);
      } else {
        const currentStep = steps.indexOf(order.status);
        const timeline = document.createElement("div");
        timeline.className = "order-timeline";
        timeline.setAttribute("aria-label", "Захиалгын явц");

        steps.forEach((step, index) => {
          const item = document.createElement("div");
          item.className = "order-step";

          if (currentStep >= 0 && index < currentStep) {
            item.classList.add("completed");
          }
          if (index === currentStep) {
            item.classList.add("active");
          }

          const dot = document.createElement("span");
          dot.className = "order-step-dot";
          dot.textContent = currentStep >= index ? "✓" : String(index + 1);

          const label = document.createElement("span");
          label.className = "order-step-label";
          label.textContent = step;

          item.append(dot, label);
          timeline.appendChild(item);
        });

        card.appendChild(timeline);
      }

      // Захиалгын төлөвийн өөрчлөлтийн түүх
      const historySection = document.createElement("div");
      historySection.className = "order-history";

      const historyTitle = document.createElement("strong");
      historyTitle.className = "order-history-title";
      historyTitle.textContent = "Төлөвийн түүх";

      const historyList = document.createElement("div");
      historyList.className = "order-history-list";

      const history = Array.isArray(order.statusHistory)
        ? [...order.statusHistory].sort(
            (a, b) => new Date(a.changedAt) - new Date(b.changedAt)
          )
        : [];

      if (history.length) {
        history.forEach(entry => {
          const historyItem = document.createElement("div");
          historyItem.className = "order-history-item";

          const historyStatus = document.createElement("span");
          historyStatus.className = "order-history-status";
          historyStatus.textContent = entry.status;

          const historyDate = document.createElement("time");
          historyDate.className = "order-history-date";
          historyDate.textContent = new Date(entry.changedAt).toLocaleString("mn-MN");

          historyItem.append(historyStatus, historyDate);
          historyList.appendChild(historyItem);
        });
      } else {
        historyList.textContent = "Төлөвийн түүх одоогоор байхгүй байна.";
      }

      historySection.append(historyTitle, historyList);
      card.appendChild(historySection);

      const total = document.createElement("p");
      total.textContent = "Нийт: " + Number(order.total).toLocaleString("mn-MN") + "₮";

      const date = document.createElement("p");
      date.textContent = "Захиалсан: " + new Date(order.createdAt).toLocaleString("mn-MN");

      const updated = document.createElement("p");
      updated.className = "order-updated";
      updated.textContent = "Сүүлд шинэчлэгдсэн: " +
        new Date(order.updatedAt || order.createdAt).toLocaleString("mn-MN");

      const items = document.createElement("p");
      items.textContent = "Бараа: " + order.items.map(item =>
        `${item.name} × ${item.quantity}`
      ).join(", ");

      card.append(total, date, updated, items);
      container.appendChild(card);
    });
  } catch (error) {
    container.textContent = error.message;
  }
}

function closeAccountOrders() {
  document.getElementById("ordersBackdrop")?.classList.remove("show");
}

async function saveAccountProfile(event) {
  event.preventDefault();

  const message = document.getElementById("accountProfileMessage");
  const name = document.getElementById("accountName").value.trim();
  const phone = document.getElementById("accountPhone").value.trim();

  message.textContent = "Хадгалж байна...";

  try {
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Мэдээлэл хадгалж чадсангүй.");

    currentUser = { ...currentUser, ...data.user };
    updateHeaderAuth();
    message.textContent = "Мэдээлэл амжилттай хадгалагдлаа.";
  } catch (error) {
    message.textContent = error.message;
  }
}

async function saveAccountPassword(event) {
  event.preventDefault();

  const message = document.getElementById("accountPasswordMessage");
  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmNewPassword").value;

  if (newPassword !== confirmPassword) {
    message.textContent = "Шинэ нууц үгнүүд таарахгүй байна.";
    return;
  }

  message.textContent = "Нууц үг сольж байна...";

  try {
    const response = await fetch("/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Нууц үг сольж чадсангүй.");

    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmNewPassword").value = "";
    message.textContent = "Нууц үг амжилттай солигдлоо.";
  } catch (error) {
    message.textContent = error.message;
  }
}

async function saveAccountProfile(event) {
  event.preventDefault();

  const message = document.getElementById("accountProfileMessage");
  const name = document.getElementById("accountName").value.trim();
  const phone = document.getElementById("accountPhone").value.trim();

  message.textContent = "Хадгалж байна...";

  try {
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Мэдээлэл хадгалж чадсангүй.");

    currentUser = { ...currentUser, ...data.user };
    updateHeaderAuth();
    message.textContent = "Мэдээлэл амжилттай хадгалагдлаа.";
  } catch (error) {
    message.textContent = error.message;
  }
}

async function saveAccountPassword(event) {
  event.preventDefault();

  const message = document.getElementById("accountPasswordMessage");
  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmNewPassword").value;

  if (newPassword !== confirmPassword) {
    message.textContent = "Шинэ нууц үгнүүд таарахгүй байна.";
    return;
  }

  message.textContent = "Нууц үг сольж байна...";

  try {
    const response = await fetch("/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Нууц үг сольж чадсангүй.");

    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmNewPassword").value = "";
    message.textContent = "Нууц үг амжилттай солигдлоо.";
  } catch (error) {
    message.textContent = error.message;
  }
}

/* ===== VELTRIX LIVE CHAT ===== */

let chatPollingTimer = null;
let chatLoading = false;
let chatLastMessageId = "";

function toggleChat() {
  const panel = document.getElementById("chatPanel");
  const notice = document.getElementById("chatLoginNotice");
  const form = document.getElementById("chatForm");

  if (!panel) return;

  panel.hidden = !panel.hidden;

  if (panel.hidden) {
    stopChatPolling();
    return;
  }

  if (!currentUser) {
    notice.hidden = false;
    form.hidden = true;
    document.getElementById("chatMessages").innerHTML =
      '<p class="muted">Чат ашиглахын тулд нэвтэрнэ үү.</p>';
    stopChatPolling();
    return;
  }

  notice.hidden = true;
  form.hidden = false;
  loadChatMessages();
  startChatPolling();
}

function stopChatPolling() {
  if (chatPollingTimer) {
    clearInterval(chatPollingTimer);
    chatPollingTimer = null;
  }
}

function startChatPolling() {
  stopChatPolling();

  chatPollingTimer = setInterval(() => {
    const panel = document.getElementById("chatPanel");

    if (!panel || panel.hidden || !currentUser) {
      stopChatPolling();
      return;
    }

    loadChatMessages();
  }, 4000);
}

async function loadChatMessages() {
  if (chatLoading || !currentUser) return;

  chatLoading = true;

  try {
    const response = await fetch("/api/chat/messages", {
      cache: "no-store"
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Чат ачааллахад алдаа гарлаа.");
    }

    renderChatMessages(data.messages || []);
  } catch (error) {
    console.error("Chat error:", error);
  } finally {
    chatLoading = false;
  }
}

function renderChatMessages(messages) {
  const container = document.getElementById("chatMessages");
  if (!container) return;

  const lastId = messages.length
    ? String(messages[messages.length - 1]._id)
    : "";

  const isNearBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight < 80;

  if (lastId === chatLastMessageId && container.dataset.loaded === "true") {
    return;
  }

  chatLastMessageId = lastId;
  container.dataset.loaded = "true";
  container.replaceChildren();

  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Сайн байна уу! VELTRIX-тэй холбогдсонд баярлалаа.";
    container.appendChild(empty);
    return;
  }

  messages.forEach(item => {
    const bubble = document.createElement("div");
    bubble.className =
      "chat-message " + (item.sender === "user" ? "mine" : "theirs");

    const content = document.createElement("div");
    content.textContent = item.message;

    const time = document.createElement("small");
    time.textContent = new Date(item.createdAt).toLocaleString("mn-MN", {
      hour: "2-digit",
      minute: "2-digit"
    });

    bubble.append(content, time);
    container.appendChild(bubble);
  });

  if (isNearBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

async function sendChatMessage(event) {
  event.preventDefault();

  const input = document.getElementById("chatInput");
  const button = document.getElementById("chatSend");
  const message = input.value.trim();

  if (!message || !currentUser) return;

  button.disabled = true;

  try {
    const response = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Мессеж илгээж чадсангүй.");
    }

    input.value = "";
    await loadChatMessages();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    input.focus();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("chatForm");

  if (form) {
    form.addEventListener("submit", sendChatMessage);
  }
});

/* ===== LIVE CHAT END ===== */

