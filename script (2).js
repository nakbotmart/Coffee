/* =========================================================
   Fresh Craft Coffee — script.js
   Handles: product.html (list + filter), order.html (form),
            admin.html (CSV order table)
   ========================================================= */

(() => {
  "use strict";

  // ---------- Config (แก้ไข URL เหล่านี้ให้เป็นของจริงก่อนใช้งาน) ----------
  const PRODUCTS_JSON_URL = "products.json";
  const APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbynguRV_U2vi0QTX92gDDez35R2CMyGhmXB-WC6jQbpG8dU_u-se5QAvVG9N8uADIUl/exec"; // URL ปลายทางสำหรับส่งคำสั่งซื้อ (Google Apps Script Web App)
  const CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTQ3ZV_waOPVj20de-qGlnNKn5AygN13Sv71Nuwxig46_DtlCRlBb285HFKjPfVkiPL0L-qbS_hE91R/pub?gid=0&single=true&output=csv"; // URL ของ CSV รายการคำสั่งซื้อ (Google Sheet publish to web)

  // ---------- Mood labels ----------
  const MOODS = [
    { key: "all", label: "ทั้งหมด" },
    { key: "espresso", label: "เข้มข้น ตื่นตัว" },
    { key: "latte", label: "นุ่มนวล ผ่อนคลาย" },
    { key: "fruity", label: "สดชื่น ผลไม้" },
    { key: "coldbrew", label: "สกัดเย็น ดื่มง่าย" },
  ];

  // ---------- Utilities ----------
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function formatPrice(price) {
    const num = Number(price);
    return Number.isFinite(num) ? num.toLocaleString("th-TH") : escapeHtml(price);
  }

  // =========================================================
  // 1) product.html — product list + mood filter
  // =========================================================
  function initProductPage() {
    const listEl = document.getElementById("product-list");
    const filterBarEl = document.getElementById("filter-bar");
    if (!listEl) return;

    let allProducts = [];

    function renderFilterBar(activeMood) {
      if (!filterBarEl) return;
      filterBarEl.innerHTML = "";
      MOODS.forEach((mood) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mood-tab" + (mood.key === activeMood ? " active" : "");
        btn.dataset.mood = mood.key;
        btn.textContent = mood.label;
        btn.addEventListener("click", () => {
          const newMood = mood.key === "all" ? null : mood.key;
          const url = new URL(window.location.href);
          if (newMood) {
            url.searchParams.set("mood", newMood);
          } else {
            url.searchParams.delete("mood");
          }
          window.history.pushState({}, "", url);
          applyFilterAndRender();
        });
        filterBarEl.appendChild(btn);
      });
    }

    function renderProducts(products) {
      listEl.innerHTML = "";

      if (!products || products.length === 0) {
        const emptyMsg = document.createElement("p");
        emptyMsg.className = "empty-message";
        emptyMsg.textContent = "ไม่พบสินค้าในหมวดหมู่นี้";
        listEl.appendChild(emptyMsg);
        return;
      }

      products.forEach((product) => {
        const card = document.createElement("div");
        card.className = "product-card";

        const orderUrl =
          "order.html?item=" +
          encodeURIComponent(product.name) +
          "&price=" +
          encodeURIComponent(product.price);

        card.innerHTML = `
          <img class="product-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">
          <div class="product-card-body">
            <div class="mood-label">
              <span class="mood-dot ${escapeHtml(product.mood)}"></span>${escapeHtml(product.mood)}
            </div>
            <h3>${escapeHtml(product.name)}</h3>
            <p class="description">${escapeHtml(product.description || "")}</p>
            <div class="price">${formatPrice(product.price)} บาท</div>
            <a class="btn btn-primary" href="${orderUrl}">สั่งซื้อ</a>
          </div>
        `;
        listEl.appendChild(card);
      });
    }

    function applyFilterAndRender() {
      const moodParam = getQueryParam("mood");
      const activeMood = moodParam && MOODS.some((m) => m.key === moodParam) ? moodParam : "all";

      renderFilterBar(activeMood);

      const filtered =
        activeMood === "all"
          ? allProducts
          : allProducts.filter((p) => p.mood === activeMood);

      renderProducts(filtered);
    }

    listEl.innerHTML = "<p class=\"loading-message\">กำลังโหลดสินค้า...</p>";

    fetch(PRODUCTS_JSON_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Network response was not ok: " + res.status);
        return res.json();
      })
      .then((data) => {
        allProducts = Array.isArray(data.products) ? data.products : [];
        applyFilterAndRender();
      })
      .catch((err) => {
        console.error("โหลดข้อมูลสินค้าล้มเหลว:", err);
        listEl.innerHTML = "<p class=\"empty-message\">ไม่สามารถโหลดข้อมูลสินค้าได้ กรุณาลองใหม่อีกครั้ง</p>";
      });

    // รองรับปุ่ม back/forward ของเบราว์เซอร์
    window.addEventListener("popstate", applyFilterAndRender);
  }

  // =========================================================
  // 2) order.html — auto-fill + submit order form
  // =========================================================
  function initOrderPage() {
    const form = document.getElementById("orderForm");
    if (!form) return;

    const itemsEl = document.getElementById("items");
    const totalEl = document.getElementById("total");
    const nameEl = document.getElementById("customerName");
    const contactEl = document.getElementById("contact");
    const noteEl = document.getElementById("note");

    // Auto-fill จาก URL parameters ทันทีที่โหลดหน้า
    const itemParam = getQueryParam("item");
    const priceParam = getQueryParam("price");

    if (itemParam && itemsEl) {
      itemsEl.value = itemParam;
    }
    if (priceParam && totalEl) {
      totalEl.value = priceParam;
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      const orderData = {
        customerName: nameEl ? nameEl.value : "",
        contact: contactEl ? contactEl.value : "",
        items: itemsEl ? itemsEl.value : "",
        total: totalEl ? totalEl.value : "",
        note: noteEl ? noteEl.value : "",
        timestamp: new Date().toISOString(),
      };

      // ส่งแบบ POST JSON โดยไม่ตั้ง custom headers (เลี่ยง CORS preflight สำหรับ Apps Script)
      fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(orderData),
      })
        .then(() => {
          window.location.href = "thankyou.html";
        })
        .catch((err) => {
          console.error("ส่งคำสั่งซื้อล้มเหลว:", err);
          alert("เกิดข้อผิดพลาดในการส่งคำสั่งซื้อ กรุณาลองใหม่อีกครั้ง");
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  // =========================================================
  // 3) admin.html — CSV orders table
  // =========================================================
  function parseCsv(text) {
    // CSV parser ที่รองรับ quoted field และ comma/newline ภายใน quote
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          field += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          row.push(field);
          field = "";
        } else if (char === "\n") {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
        } else if (char === "\r") {
          // ข้าม \r ปล่อยให้ \n จัดการขึ้นบรรทัดใหม่
        } else {
          field += char;
        }
      }
    }

    // field/row สุดท้ายที่เหลือ (กรณีไฟล์ไม่ได้ลงท้ายด้วย newline)
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
  }

  function initAdminPage() {
    const table = document.getElementById("ordersTable");
    if (!table) return;

    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="99">กำลังโหลดข้อมูล...</td></tr>';

    fetch(CSV_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Network response was not ok: " + res.status);
        return res.text();
      })
      .then((csvText) => {
        const rows = parseCsv(csvText);
        tbody.innerHTML = "";

        if (rows.length <= 1) {
          tbody.innerHTML = '<tr><td colspan="99">ยังไม่มีรายการคำสั่งซื้อ</td></tr>';
          return;
        }

        // แถวแรกถือเป็น header ใช้เพื่อระบุจำนวนคอลัมน์เท่านั้น ไม่แสดงซ้ำใน tbody
        const dataRows = rows.slice(1);

        dataRows.forEach((cols) => {
          const tr = document.createElement("tr");
          cols.forEach((cell) => {
            const td = document.createElement("td");
            td.textContent = cell;
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
      })
      .catch((err) => {
        console.error("โหลดข้อมูลคำสั่งซื้อล้มเหลว:", err);
        tbody.innerHTML = '<tr><td colspan="99">ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง</td></tr>';
      });
  }

  // =========================================================
  // Init — ตรวจจับหน้าปัจจุบันจาก element ที่มีอยู่
  // =========================================================
  document.addEventListener("DOMContentLoaded", () => {
    initProductPage();
    initOrderPage();
    initAdminPage();
  });
})();
