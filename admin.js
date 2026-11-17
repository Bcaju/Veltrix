const $ = id => document.getElementById(id);

const modal = $("modal");
const form = $("productForm");

let products = [];
let editingId = null;

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Алдаа: ${response.status}`);
  }

  return data;
}

function showLogin() {
  $("login").hidden = false;
  $("dashboard").hidden = true;
  $("logout").hidden = true;
  if (adminChatPolling) {
    clearInterval(adminChatPolling);
    adminChatPolling = null;
  }
}

function enter() {
  $("login").hidden = true;
  $("dashboard").hidden = false;
  $("logout").hidden = false;
  loadProducts();
  loadOrders();
  loadStats();
  loadChatConversations();
  startAdminChatPolling();
}


const orderStatuses = [
  "Шинэ",
  "Баталгаажсан",
  "Бэлтгэж байна",
  "Хүргэлтэд гарсан",
  "Дууссан",
  "Цуцалсан"
];

async function loadOrders() {
  const rows = $("orderRows");
  const message = $("ordersMessage");
  if (!rows || !message) return;

  try {
    const orders = await api("/api/admin/orders");
    message.textContent = `${orders.length} захиалга бүртгэлтэй байна.`;

    if (!orders.length) {
      rows.innerHTML = '<tr><td colspan="7">Одоогоор захиалга алга.</td></tr>';
      return;
    }

    rows.innerHTML = orders.map(order => {
      const items = (order.items || []).map((item, index) => `
        <div class="order-item-cost">
          <strong>${esc(item.name)} × ${Number(item.quantity)}</strong>
          <small>Нэгжийн өртөг (₮)</small>
          <div class="order-item-cost-controls">
            <input
              type="number"
              min="0"
              step="1"
              value="${item.cost == null ? "" : Number(item.cost)}"
              data-order-cost="${esc(order._id)}"
              data-item-index="${index}"
              aria-label="Нэгжийн өртөг"
            >
            <button
              type="button"
              data-save-order-cost="${esc(order._id)}"
              data-item-index="${index}"
            >Хадгалах</button>
          </div>
        </div>
      `).join("");

      const options = orderStatuses.map(status =>
        `<option value="${esc(status)}" ${order.status === status ? "selected" : ""}>${esc(status)}</option>`
      ).join("");

      const date = order.createdAt
        ? new Date(order.createdAt).toLocaleString("mn-MN")
        : "-";

      return `
        <tr>
          <td><strong>${esc(order.orderNumber)}</strong><br><small>${esc(date)}</small></td>
          <td>${esc(order.customerName)}<br>${esc(order.phone)}</td>
          <td>${order.deliveryType === "delivery" ? "Хүргэлт" : "Өөрөө авах"}<br><small>${esc(order.address || "Хаяггүй")}</small></td>
          <td>${items}</td>
          <td>${Number(order.total).toLocaleString("mn-MN")} ₮</td>
          <td>${order.paymentMethod === "cash" ? "Бэлэн мөнгө" : "Шилжүүлэг"}</td>
          <td>
            <select data-order-status="${esc(order._id)}">
              ${options}
            </select>
          </td>
        </tr>
      `;
    }).join("");
  } catch (error) {
    message.textContent = "Захиалга ачаалж чадсангүй: " + error.message;
  }
}

$("orderRows")?.addEventListener("change", async event => {
  const select = event.target.closest("[data-order-status]");
  if (!select) return;

  const id = select.dataset.orderStatus;
  const status = select.value;
  select.disabled = true;

  try {
    await api(`/api/admin/orders/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    $("ordersMessage").textContent = "Захиалгын төлөв шинэчлэгдлээ.";
    await Promise.all([loadOrders(), loadProducts()]);
  } catch (error) {
    $("ordersMessage").textContent = "Алдаа: " + error.message;
    await loadOrders();
  }
});

$("orderRows")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-save-order-cost]");
  if (!button) return;

  const id = button.dataset.saveOrderCost;
  const index = Number(button.dataset.itemIndex);
  const input = $("orderRows").querySelector(
    `[data-order-cost="${CSS.escape(id)}"][data-item-index="${index}"]`
  );

  if (!input || input.value.trim() === "") {
    $("ordersMessage").textContent = "Нэгжийн өртгийг оруулна уу.";
    input?.focus();
    return;
  }

  const cost = Number(input.value);

  if (!Number.isFinite(cost) || cost < 0) {
    $("ordersMessage").textContent = "Өртөг 0 буюу түүнээс дээш байх ёстой.";
    input.focus();
    return;
  }

  button.disabled = true;

  try {
    await api(`/api/admin/orders/${encodeURIComponent(id)}/items/${index}/cost`, {
      method: "PATCH",
      body: JSON.stringify({ cost })
    });

    $("ordersMessage").textContent = "Барааны өртөг амжилттай хадгалагдлаа.";
    await Promise.all([loadOrders(), loadStats()]);
  } catch (error) {
    $("ordersMessage").textContent = "Өртөг хадгалахад алдаа гарлаа: " + error.message;
    button.disabled = false;
  }
});

$("refreshOrders")?.addEventListener("click", loadOrders);

async function loadProducts() {
  try {
    products = await api("/api/products");
    render();
    $("message").textContent = `${products.length} бараа бүртгэлтэй байна.`;
  } catch (error) {
    if (error.message.toLowerCase().includes("нэвтр")) {
      showLogin();
    } else {
      $("message").textContent = "Алдаа: " + error.message;
    }
  }
}

$("loginForm").onsubmit = async event => {
  event.preventDefault();
  $("error").textContent = "";

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: $("pin").value })
    });

    $("pin").value = "";
    enter();
  } catch (error) {
    $("error").textContent = error.message;
  }
};

$("logout").onclick = async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
  } catch (error) {
    console.error(error);
  }

  products = [];
  showLogin();
};

let currentProductImage = "";

const productImageFile = $("productImageFile");

function showProductImagePreview(src) {
  const wrap = $("productImagePreviewWrap");
  const preview = $("productImagePreview");

  if (src) {
    preview.src = src;
    wrap.hidden = false;
  } else {
    preview.removeAttribute("src");
    wrap.hidden = true;
  }
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Зураг уншиж чадсангүй."));
    reader.readAsDataURL(file);
  });
}

productImageFile.addEventListener("change", async () => {
  const file = productImageFile.files[0];

  if (!file) return;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    $("formError").textContent = "JPEG, PNG эсвэл WEBP зураг сонгоно уу.";
    productImageFile.value = "";
    return;
  }

  if (file.size > 700 * 1024) {
    $("formError").textContent = "Зургийн хэмжээ 700KB-аас бага байх ёстой.";
    productImageFile.value = "";
    return;
  }

  try {
    currentProductImage = await readImageFile(file);
    showProductImagePreview(currentProductImage);
    $("formError").textContent = "";
  } catch (error) {
    $("formError").textContent = error.message;
  }
});

$("new").onclick = () => {
  editingId = null;
  currentProductImage = "";
  form.reset();
  showProductImagePreview("");
  $("modalTitle").textContent = "Шинэ бараа";
  $("formError").textContent = "";
  modal.showModal();
};

$("close").onclick = () => modal.close();

form.onsubmit = async event => {
  event.preventDefault();
  $("formError").textContent = "";

  const data = Object.fromEntries(new FormData(form));

  const payload = {
    name: data.name.trim(),
    category: data.category,
    price: Number(data.price),
    cost: Number(data.cost),
    stock: Number(data.stock),
    image: currentProductImage,
    description: data.description.trim()
  };

  if (!payload.name || !payload.category ||
      !Number.isFinite(payload.price) || payload.price < 0 ||
      !Number.isFinite(payload.cost) || payload.cost < 0 ||
      !Number.isInteger(payload.stock) || payload.stock < 0) {
    $("formError").textContent = "Мэдээллээ зөв бөглөнө үү.";
    return;
  }

  try {
    if (editingId) {
      await api("/api/products/" + encodeURIComponent(editingId), {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      await api("/api/products", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    modal.close();
    form.reset();
    editingId = null;
    currentProductImage = "";
    showProductImagePreview("");
    await loadProducts();
  } catch (error) {
    $("formError").textContent = error.message;
  }
};

function editProduct(id) {
  const product = products.find(item => item._id === id);
  if (!product) return;

  editingId = product._id;
  currentProductImage = product.image || "";

  $("modalTitle").textContent = "Бараа засах";
  $("formError").textContent = "";

  form.elements.name.value = product.name || "";
  form.elements.category.value = product.category || "";
  form.elements.price.value = product.price ?? 0;
  form.elements.cost.value = product.cost ?? 0;
  form.elements.stock.value = product.stock ?? 0;
  productImageFile.value = "";
  showProductImagePreview(currentProductImage);
  form.elements.description.value = product.description || "";

  modal.showModal();
}

async function deleteProduct(id) {
  const product = products.find(item => item._id === id);
  if (!product) return;

  if (!confirm(`"${product.name}" барааг устгах уу?`)) return;

  try {
    await api("/api/products/" + encodeURIComponent(id), {
      method: "DELETE"
    });
    await loadProducts();
  } catch (error) {
    alert("Устгахад алдаа гарлаа: " + error.message);
  }
}

function render() {
  $("total").textContent = products.length;

  $("low").textContent = products.filter(
    item => Number(item.stock) > 0 && Number(item.stock) <= 5
  ).length;

  $("empty").textContent = products.filter(
    item => Number(item.stock) === 0
  ).length;

  $("stockTotal").textContent = products.reduce(
    (sum, item) => sum + Number(item.stock || 0), 0
  );

  const query = $("search").value.trim().toLowerCase();
  const category = $("filter").value;

  const filtered = products.filter(item => {
    const matchesSearch =
      String(item.name || "").toLowerCase().includes(query);

    const matchesCategory =
      !category || item.category === category;

    return matchesSearch && matchesCategory;
  });

  $("rows").innerHTML = filtered.length
    ? filtered.map(item => {
        const stock = Number(item.stock || 0);

        const image = item.image
          ? `<img class="product-image" src="${esc(item.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
          : `<div class="no-image">🚲</div>`;

        const stockClass = stock === 0
          ? "stock-zero"
          : stock <= 5 ? "stock-low" : "";

        return `
          <tr>
            <td>${image}</td>
            <td>
              <strong>${esc(item.name)}</strong>
              <div class="muted">${esc(item.description || "")}</div>
            </td>
            <td>${esc(item.category)}</td>
            <td>${Number(item.price).toLocaleString("mn-MN")} ₮</td>
            <td class="${stockClass}">${stock}</td>
            <td>
              <button class="action" data-edit="${esc(item._id)}">Засах</button>
              <button class="action delete" data-delete="${esc(item._id)}">Устгах</button>
            </td>
          </tr>
        `;
      }).join("")
    : '<tr><td colspan="6">Бараа олдсонгүй.</td></tr>';
}

$("rows").addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");

  if (editButton) editProduct(editButton.dataset.edit);
  if (deleteButton) deleteProduct(deleteButton.dataset.delete);
});

$("search").oninput = render;
$("filter").onchange = render;

(async function init() {
  try {
    await api("/api/admin/me");
    enter();
  } catch {
    showLogin();
  }
})();


// Борлуулалтын статистик
async function loadStats() {
  const message = $("statsMessage");

  try {
    const data = await api("/api/admin/stats");

    $("statOrders").textContent = Number(data.totalOrders || 0).toLocaleString("mn-MN");
    $("statNew").textContent = Number(data.newOrders || 0).toLocaleString("mn-MN");
    $("statCompleted").textContent = Number(data.completedOrders || 0).toLocaleString("mn-MN");
    $("statRevenue").textContent = Number(data.revenue || 0).toLocaleString("mn-MN") + " ₮";
    $("statCost").textContent = Number(data.totalCost || 0).toLocaleString("mn-MN") + " ₮";
    $("statProfit").textContent = Number(data.grossProfit || 0).toLocaleString("mn-MN") + " ₮";

    const tracked = Number(data.profitTrackedOrders || 0);
    const completed = Number(data.completedOrders || 0);
    const untracked = Math.max(completed - tracked, 0);

    $("profitCoverage").textContent =
      `Ашиг тооцсон захиалга: ${tracked} / ${completed}. ` +
      (untracked > 0
        ? `${untracked} захиалгын өртөг бүрэн бүртгэгдээгүй тул ашгийн тооцоонд ороогүй.`
        : "Бүх дууссан захиалгын өртөг бүртгэлтэй байна.");

    const dailyMap = new Map(
      (data.daily || []).map(item => [item._id, item])
    );

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      const key = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
      ].join("-");

      days.push({
        key,
        label: date.toLocaleDateString("mn-MN", { day: "numeric", month: "short" }),
        total: Number(dailyMap.get(key)?.total || 0)
      });
    }

    const max = Math.max(...days.map(day => day.total), 1);

    $("salesChart").innerHTML = `
      <div class="sales-bars">
        ${days.map(day => `
          <div class="sales-bar-item">
            <strong>${day.total.toLocaleString("mn-MN")} ₮</strong>
            <div class="sales-bar-track">
              <div class="sales-bar-fill" style="height:${Math.max(day.total / max * 100, day.total ? 4 : 0)}%"></div>
            </div>
            <small>${esc(day.label)}</small>
          </div>
        `).join("")}
      </div>
    `;

    const top = data.topProducts || [];

    $("topProducts").innerHTML = top.length
      ? `<div class="top-products-list">
          ${top.map((item, index) => `
            <div class="top-product-item">
              <span class="top-product-rank">${index + 1}</span>
              <div class="top-product-info">
                <strong>${esc(item._id || "Нэргүй бараа")}</strong>
                <small>${Number(item.quantity || 0).toLocaleString("mn-MN")} ширхэг</small>
              </div>
              <b>${Number(item.revenue || 0).toLocaleString("mn-MN")} ₮</b>
            </div>
          `).join("")}
        </div>`
      : '<p class="muted">Одоогоор дууссан захиалгад бараа алга.</p>';

    const lowStock = data.lowStock || [];
    const lowStockContainer = $("lowStockProducts");

    if (lowStockContainer) {
      lowStockContainer.innerHTML = lowStock.length
        ? `<div class="low-stock-list">
            ${lowStock.map(item => `
              <div class="low-stock-item">
                <div>
                  <strong>${esc(item.name || "Нэргүй бараа")}</strong>
                  <small>${esc(item.category || "Ангилалгүй")}</small>
                </div>
                <span class="low-stock-count">${Number(item.stock || 0)} ширхэг үлдсэн</span>
              </div>
            `).join("")}
          </div>`
        : '<p class="muted">Нөөц багатай бараа алга. Бүх барааны үлдэгдэл хэвийн байна.</p>';
    }

    const weeklyRevenue = days.reduce((sum, day) => sum + day.total, 0);

    // VELTRIX SMART FORECAST
    const forecastContainer = $("smartForecast");
    const forecastProducts = data.forecastProducts || [];

    if (forecastContainer) {
      const activeForecasts = forecastProducts
        .filter(item => Number(item.sold30Days || 0) > 0)
        .sort((a, b) => {
          const aDays = a.daysRemaining ?? Infinity;
          const bDays = b.daysRemaining ?? Infinity;
          return aDays - bDays;
        });

      const previousRevenue = Number(data.previousWeekRevenue || 0);
      const currentRevenue = weeklyRevenue;
      const revenueChange = previousRevenue > 0
        ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
        : null;

      forecastContainer.innerHTML = `
        <div class="ai-insights-list">
          <div class="ai-insight-item info">
            <strong>📊 7 хоногийн орлогын харьцуулалт</strong>
            <p>Одоогийн 7 хоног: ${currentRevenue.toLocaleString("mn-MN")} ₮</p>
            <p>Өмнөх 7 хоног: ${previousRevenue.toLocaleString("mn-MN")} ₮</p>
            <p>${revenueChange === null
              ? "Өмнөх 7 хоногийн орлого байхгүй тул өөрчлөлтийг тооцох боломжгүй."
              : `Өөрчлөлт: ${revenueChange >= 0 ? "+" : ""}${revenueChange.toFixed(1)}%`}</p>
          </div>

          ${activeForecasts.length
            ? activeForecasts.map(item => {
                const days = item.daysRemaining;
                const urgent = days !== null && days <= 7;
                const warning = days !== null && days <= 14;

                return `
                  <div class="ai-insight-item ${urgent ? "warning" : "info"}">
                    <strong>${esc(item.name)}</strong>
                    <p>Сүүлийн 30 хоногт: ${Number(item.sold30Days).toLocaleString("mn-MN")} ширхэг</p>
                    <p>Өдөрт дунджаар: ${Number(item.dailySales).toLocaleString("mn-MN")} ширхэг</p>
                    <p>Одоогийн үлдэгдэл: ${Number(item.stock).toLocaleString("mn-MN")} ширхэг</p>
                    <p>${days === null
                      ? "Нөөц хүрэлцэх хугацаа тооцоогүй."
                      : `Тооцоолсон нөөц хүрэлцэх хугацаа: ${days} өдөр`}</p>
                    <p>${Number(item.suggestedRestock) > 0
                      ? `📦 14 хоногийн нөөц бүрдүүлэх санал: ${Number(item.suggestedRestock).toLocaleString("mn-MN")} ширхэг`
                      : "Одоогийн нөөц 14 хоногийн тооцоолсон хэрэгцээг хангана."}</p>
                    ${warning ? '<small>⚠️ Нөөцөө ойрын хугацаанд шалгаарай.</small>' : ""}
                  </div>
                `;
              }).join("")
            : '<p class="muted">Сүүлийн 30 хоногт дууссан захиалгаар зарагдсан бараа одоогоор алга.</p>'}
        </div>
        <small class="muted">Энэ нь сүүлийн 30 хоногийн борлуулалтад суурилсан автомат тооцоо бөгөөд бодит эрэлт өөрчлөгдөж болно.</small>
      `;
    }


    // VELTRIX TREND ANALYSIS
    const trendContainer = $("trendAnalysis");
    const trendProducts = data.forecastProducts || [];

    if (trendContainer) {
      const sortedTrends = [...trendProducts]
        .filter(item =>
          Number(item.sold30Days || 0) > 0 ||
          Number(item.previousSold30Days || 0) > 0
        )
        .sort((a, b) => {
          const priority = {
            "Шинэ эрэлт": 3,
            "Өсөж байна": 2,
            "Буурч байна": 1,
            "Тогтвортой": 0
          };

          return (priority[b.trend] || 0) - (priority[a.trend] || 0);
        });

      const trendConfig = {
        "Шинэ эрэлт": {
          icon: "🆕",
          label: "ШИНЭ ЭРЭЛТ",
          type: "success",
          advice: "Энэ барааны эрэлт шинээр нэмэгдсэн байна. Нөөцөө шалгаарай."
        },
        "Өсөж байна": {
          icon: "📈",
          label: "ӨСӨЛТТЭЙ",
          type: "success",
          advice: "Борлуулалт өсөж байна. Нөөцөө нэмэгдүүлэх боломжийг судлаарай."
        },
        "Буурч байна": {
          icon: "📉",
          label: "БУУРАЛТТАЙ",
          type: "warning",
          advice: "Борлуулалт буурсан байна. Үнэ болон хэрэглэгчийн эрэлтийг шалгаарай."
        },
        "Тогтвортой": {
          icon: "➡️",
          label: "ТОГТВОРТОЙ",
          type: "info",
          advice: "Борлуулалт өмнөх үеийн түвшинд байна."
        }
      };

      const growthCount = sortedTrends.filter(item =>
        item.trend === "Өсөж байна" || item.trend === "Шинэ эрэлт"
      ).length;

      const declineCount = sortedTrends.filter(item =>
        item.trend === "Буурч байна"
      ).length;

      trendContainer.innerHTML = `
        <div class="trend-summary">
          <div class="trend-summary-card">
            <strong>${growthCount}</strong>
            <span>📈 Өсөлттэй / шинэ эрэлт</span>
          </div>
          <div class="trend-summary-card">
            <strong>${declineCount}</strong>
            <span>📉 Бууралттай</span>
          </div>
          <div class="trend-summary-card">
            <strong>${sortedTrends.length}</strong>
            <span>📦 Шинжилсэн бараа</span>
          </div>
        </div>

        <div class="trend-products">
          ${sortedTrends.length
            ? sortedTrends.map(item => {
                const config = trendConfig[item.trend] || trendConfig["Тогтвортой"];
                const change = item.trendPercent;
                const changeText = change === null
                  ? "Өмнөх үед борлуулалт байгаагүй"
                  : `${change > 0 ? "+" : ""}${change}%`;

                return `
                  <div class="trend-product-card ${config.type}">
                    <div class="trend-product-heading">
                      <strong>${esc(item.name)}</strong>
                      <span class="trend-status">${config.icon} ${config.label}</span>
                    </div>

                    <div class="trend-comparison">
                      <div>
                        <small>Өмнөх 30 хоног</small>
                        <strong>${Number(item.previousSold30Days || 0).toLocaleString("mn-MN")} ш</strong>
                      </div>
                      <div>
                        <small>Сүүлийн 30 хоног</small>
                        <strong>${Number(item.sold30Days || 0).toLocaleString("mn-MN")} ш</strong>
                      </div>
                      <div>
                        <small>Өөрчлөлт</small>
                        <strong>${changeText}</strong>
                      </div>
                    </div>

                    <p>${config.advice}</p>
                    <small>Одоогийн нөөц: ${Number(item.stock || 0).toLocaleString("mn-MN")} ширхэг</small>
                  </div>
                `;
              }).join("")
            : '<p class="muted">Харьцуулах борлуулалтын мэдээлэл одоогоор алга.</p>'}
        </div>

        <small class="muted">
          Харьцуулалт: өмнөх 30 хоног ба сүүлийн 30 хоногийн дууссан захиалга.
          Энэ нь өнгөрсөн борлуулалтын өөрчлөлт бөгөөд ирээдүйн баталгаатай таамаг биш.
        </small>
      `;
    }

    // VELTRIX CUSTOMER ANALYTICS
    const customerData = data.customerAnalytics || {};

    $("customerTotal").textContent =
      Number(customerData.totalCustomers || 0).toLocaleString("mn-MN");

    $("customerNew").textContent =
      Number(customerData.newCustomers30Days || 0).toLocaleString("mn-MN");

    $("customerRepeat").textContent =
      Number(customerData.repeatCustomers || 0).toLocaleString("mn-MN");

    const customers = customerData.topCustomers || [];

    $("topCustomers").innerHTML = customers.length
      ? `
        <div class="customer-table-wrap">
          <table class="customer-table">
            <thead>
              <tr>
                <th>ХЭРЭГЛЭГЧ</th>
                <th>УТАС</th>
                <th>ДУУССАН ЗАХИАЛГА</th>
                <th>НИЙТ ХУДАЛДАН АВАЛТ</th>
              </tr>
            </thead>
            <tbody>
              ${customers.map(customer => `
                <tr>
                  <td>${esc(customer.name || "Хэрэглэгч")}</td>
                  <td>${esc(customer.phone || "Нууцалсан")}</td>
                  <td>${Number(customer.orderCount || 0).toLocaleString("mn-MN")}</td>
                  <td>${Number(customer.totalSpent || 0).toLocaleString("mn-MN")} ₮</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `
      : '<p class="muted">Одоогоор бүртгэлтэй хэрэглэгчийн дууссан захиалга алга.</p>';

    // VELTRIX SMART BUSINESS INSIGHTS
    const insights = [];
    const activeDays = days.filter(day => day.total > 0).length;
    const bestProduct = top[0];

    if (bestProduct) {
      insights.push({
        title: "Шилдэг борлуулалт",
        detail: `${bestProduct._id || "Нэргүй бараа"} — ${Number(bestProduct.quantity || 0)} ширхэг зарагдсан.`,
        type: "success"
      });
    } else {
      insights.push({
        title: "Борлуулалтын мэдээлэл",
        detail: "Одоогоор дууссан захиалгын борлуулалтын мэдээлэл алга.",
        type: "info"
      });
    }

    if (lowStock.length) {
      const popularLowStock = lowStock.filter(item =>
        top.some(product => product._id === item.name)
      );

      insights.push({
        title: "Нөөцийн анхааруулга",
        detail: popularLowStock.length
          ? `Эрэлттэй бараанаас ${popularLowStock.map(item => item.name).join(", ")} нөөц багатай байна. Нөөцөө нэмэхийг зөвлөж байна.`
          : `${lowStock.length} барааны үлдэгдэл 5 буюу түүнээс бага байна. Нөөцийг шалгаарай.`,
        type: "warning"
      });
    } else {
      insights.push({
        title: "Нөөцийн төлөв",
        detail: "5 буюу түүнээс бага үлдэгдэлтэй бараа одоогоор алга.",
        type: "success"
      });
    }

    insights.push({
      title: "7 хоногийн борлуулалт",
      detail: `${weeklyRevenue.toLocaleString("mn-MN")} ₮ орлого ${activeDays} өдөр бүртгэгдсэн байна.`,
      type: weeklyRevenue > 0 ? "success" : "info"
    });

    if (Number(data.profitTrackedOrders || 0) > 0) {
      insights.push({
        title: "Ашгийн мэдээлэл",
        detail: `${Number(data.grossProfit || 0).toLocaleString("mn-MN")} ₮ нийт ашиг өртөг нь бүрэн бүртгэгдсэн захиалгуудаас тооцогдсон.`,
        type: "success"
      });
    } else {
      insights.push({
        title: "Ашгийн мэдээлэл",
        detail: "Ашиг тооцохын тулд дууссан захиалгуудын барааны өртгийг бүрэн бүртгэнэ үү.",
        type: "warning"
      });
    }

    const insightsContainer = $("aiBusinessInsights");

    if (insightsContainer) {
      insightsContainer.innerHTML = `
        <div class="ai-insights-list">
          ${insights.map(item => `
            <div class="ai-insight-item ${item.type}">
              <strong>${esc(item.title)}</strong>
              <p>${esc(item.detail)}</p>
            </div>
          `).join("")}
        </div>
        <small class="muted">Зөвлөмжүүд нь бүртгэгдсэн бодит мэдээлэлд тулгуурласан автомат шинжилгээ юм.</small>
      `;
    }

    if (message) message.textContent = "Статистик амжилттай шинэчлэгдлээ.";
  } catch (error) {
    if (message) message.textContent = "Статистик ачаалж чадсангүй: " + error.message;
  }
}

$("refreshStats")?.addEventListener("click", loadStats);

/* ===== VELTRIX ADMIN LIVE CHAT ===== */

let selectedChatUserId = null;
let selectedChatUserName = "";
let adminChatPolling = null;
let adminChatLoading = false;
let adminChatLastId = "";
let chatUnreadSnapshot = new Map();
let chatUnreadInitialized = false;

function notifyNewChatMessage(chat) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const notification = new Notification(
    "VELTRIX — Шинэ мессеж",
    {
      body: (chat.userName || "Хэрэглэгч") + ": " +
        (chat.lastMessage || "Шинэ мессеж ирлээ.").slice(0, 110),
      icon: "/logo.svg",
      badge: "/logo.svg",
      tag: "veltrix-chat-" + chat.userId
    }
  );

  notification.onclick = () => {
    window.focus();
    selectAdminChat(chat.userId, chat.userName || "Хэрэглэгч", chat.phone || "");
    notification.close();
  };
}

async function loadChatConversations() {
  const container = $("chatConversations");
  if (!container) return;

  try {
    const data = await api("/api/admin/chats");
    const chats = data.chats || [];

    const totalUnread = chats.reduce(
      (sum, chat) => sum + Number(chat.unread || 0), 0
    );

    const totalBadge = $("chatUnreadTotal");
    if (totalBadge) {
      totalBadge.textContent = totalUnread > 99 ? "99+" : totalUnread;
      totalBadge.hidden = totalUnread === 0;
    }

    chats.forEach(chat => {
      const unread = Number(chat.unread || 0);
      const previous = chatUnreadSnapshot.get(chat.userId) || 0;

      if (chatUnreadInitialized && unread > previous && chat.lastSender === "user") {
        notifyNewChatMessage(chat);
      }

      chatUnreadSnapshot.set(chat.userId, unread);
    });

    chatUnreadInitialized = true;

    if (!chats.length) {
      container.innerHTML = '<p class="muted">Одоогоор чат алга.</p>';
      return;
    }

    container.replaceChildren();

    chats.forEach(chat => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-chat-item";

      if (chat.userId === selectedChatUserId) {
        button.classList.add("active");
      }

      const name = document.createElement("strong");
      name.textContent = chat.userName || "Хэрэглэгч";

      const preview = document.createElement("small");
      preview.textContent =
        (chat.lastSender === "admin" ? "Та: " : "") +
        (chat.lastMessage || "");

      const info = document.createElement("span");
      info.className = "admin-chat-unread";
      info.textContent = chat.unread > 0
        ? chat.unread + " шинэ мессеж"
        : "";

      button.append(name, preview, info);

      button.addEventListener("click", () => {
        selectAdminChat(chat.userId, chat.userName || "Хэрэглэгч", chat.phone || "");
      });

      container.appendChild(button);
    });
  } catch (error) {
    container.textContent = "Чатууд ачаалж чадсангүй: " + error.message;
  }
}

async function selectAdminChat(userId, name, phone) {
  selectedChatUserId = userId;
  selectedChatUserName = name;
  adminChatLastId = "";

  $("chatSelectedUser").textContent =
    name + (phone ? " · " + phone : "");

  $("adminChatMessages").innerHTML =
    '<p class="muted">Мессеж ачаалж байна...</p>';

  await loadAdminChatMessages();
  await loadChatConversations();
}

async function loadAdminChatMessages() {
  if (!selectedChatUserId || adminChatLoading) return;

  adminChatLoading = true;

  try {
    const data = await api(
      "/api/admin/chats/" + encodeURIComponent(selectedChatUserId) + "/messages"
    );

    renderAdminChatMessages(data.messages || []);
  } catch (error) {
    $("adminChatMessages").textContent = error.message;
  } finally {
    adminChatLoading = false;
  }
}

function renderAdminChatMessages(messages) {
  const container = $("adminChatMessages");
  if (!container) return;

  const lastId = messages.length
    ? String(messages[messages.length - 1]._id)
    : "";

  const isNearBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight < 80;

  if (lastId === adminChatLastId && container.dataset.loaded === "true") {
    return;
  }

  adminChatLastId = lastId;
  container.dataset.loaded = "true";
  container.replaceChildren();

  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Эхний мессежийг илгээнэ үү.";
    container.appendChild(empty);
    return;
  }

  messages.forEach(item => {
    const bubble = document.createElement("div");
    bubble.className =
      "admin-chat-bubble " + (item.sender === "admin" ? "admin" : "user");

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

async function sendAdminChatMessage(event) {
  event.preventDefault();

  if (!selectedChatUserId) {
    $("adminChatMessage").textContent = "Эхлээд хэрэглэгч сонгоно уу.";
    return;
  }

  const input = $("adminChatInput");
  const button = $("adminChatSend");
  const message = input.value.trim();

  if (!message) return;

  button.disabled = true;

  try {
    await api(
      "/api/admin/chats/" + encodeURIComponent(selectedChatUserId) + "/messages",
      {
        method: "POST",
        body: JSON.stringify({ message })
      }
    );

    input.value = "";
    $("adminChatMessage").textContent = "Хариу амжилттай илгээгдлээ.";

    await loadAdminChatMessages();
    await loadChatConversations();
  } catch (error) {
    $("adminChatMessage").textContent = error.message;
  } finally {
    button.disabled = false;
    input.focus();
  }
}

function startAdminChatPolling() {
  if (adminChatPolling) clearInterval(adminChatPolling);

  adminChatPolling = setInterval(() => {
    loadChatConversations();

    if (selectedChatUserId) {
      loadAdminChatMessages();
    }
  }, 4000);
}

$("refreshChats")?.addEventListener("click", loadChatConversations);

$("enableChatNotifications")?.addEventListener("click", async () => {
  if (!("Notification" in window)) {
    $("adminChatMessage").textContent = "Энэ браузер мэдэгдэл дэмжихгүй байна.";
    return;
  }

  const permission = await Notification.requestPermission();
  const button = $("enableChatNotifications");

  if (permission === "granted") {
    button.textContent = "🔔 Мэдэгдэл идэвхтэй";
    $("adminChatMessage").textContent = "Шинэ мессежийн мэдэгдэл идэвхжлээ.";
  } else {
    button.textContent = "🔕 Мэдэгдэл зөвшөөрөгдөөгүй";
    $("adminChatMessage").textContent = "Браузерын тохиргооноос мэдэгдэл зөвшөөрнө үү.";
  }
});

if ("Notification" in window && Notification.permission === "granted") {
  const button = $("enableChatNotifications");
  if (button) button.textContent = "🔔 Мэдэгдэл идэвхтэй";
}

$("adminChatForm")?.addEventListener("submit", sendAdminChatMessage);


/* ===== VELTRIX BUSINESS CHAT ===== */

function addBusinessChatMessage(sender, message) {
  const container = $("businessChatMessages");
  if (!container) return;

  const bubble = document.createElement("div");
  bubble.className = "ai-insight-item " +
    (sender === "admin" ? "info" : "success");

  const title = document.createElement("strong");
  title.textContent = sender === "admin" ? "Та" : "VELTRIX Assistant";

  const content = document.createElement("p");
  content.style.whiteSpace = "pre-wrap";
  content.textContent = message;

  bubble.append(title, content);
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

async function sendBusinessChatMessage(question) {
  const input = $("businessChatInput");
  const button = $("businessChatSend");
  const status = $("businessChatStatus");

  question = String(question || input?.value || "").trim();

  if (!question) return;

  if (question.length > 300) {
    status.textContent = "Асуулт 300 тэмдэгтээс хэтэрч болохгүй.";
    return;
  }

  button.disabled = true;
  status.textContent = "Бизнесийн мэдээлэл шалгаж байна...";

  addBusinessChatMessage("admin", question);

  if (input) input.value = "";

  try {
    const data = await api("/api/admin/business-chat", {
      method: "POST",
      body: JSON.stringify({ question })
    });

    addBusinessChatMessage("assistant", data.answer);
    status.textContent = "Мэдээлэл амжилттай шинэчлэгдлээ.";
  } catch (error) {
    addBusinessChatMessage("assistant", "Алдаа: " + error.message);
    status.textContent = "Хариу авахад алдаа гарлаа.";
  } finally {
    button.disabled = false;
    input?.focus();
  }
}

$("businessChatSend")?.addEventListener("click", () => {
  sendBusinessChatMessage();
});

$("businessChatInput")?.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendBusinessChatMessage();
  }
});

document.querySelectorAll(".business-question").forEach(button => {
  button.addEventListener("click", () => {
    sendBusinessChatMessage(button.dataset.question);
  });
});

/* ===== VELTRIX BUSINESS CHAT END ===== */

/* ===== ADMIN LIVE CHAT END ===== */

