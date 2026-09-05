(function () {
  const storageKey = "pauloRebeloContent";
  let content = clone(window.PAULO_DEFAULT_CONTENT);
  let requests = [];
  let requestsError = "";
  let activeTab = "summary";
  let role = "";

  const login = document.querySelector("[data-login]");
  const app = document.querySelector("[data-admin]");
  const title = document.querySelector("[data-title]");
  const roleLabel = document.querySelector("[data-role]");
  const notice = document.querySelector("[data-notice]");
  const loginNotice = document.querySelector("[data-login-notice]");

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function loadContent() {
    try {
      const response = await fetch("/api/content", { cache: "no-store" });
      if (response.ok) return normalizeContent(await response.json());
    } catch (error) {
      // Local file preview fallback.
    }
    try {
      return normalizeContent(JSON.parse(localStorage.getItem(storageKey)) || clone(window.PAULO_DEFAULT_CONTENT));
    } catch (error) {
      return normalizeContent(clone(window.PAULO_DEFAULT_CONTENT));
    }
  }

  function normalizeContent(data) {
    data.settings.instagram = data.settings.instagram || "https://www.instagram.com/treinocaninoaz/";
    if (!data.settings.facebook || data.settings.facebook === "https://www.facebook.com/") {
      data.settings.facebook = "https://www.facebook.com/CaninoTreino/";
    }
    if (data.settings.youtube === "https://www.youtube.com/") data.settings.youtube = "";
    const defaultGalleryFolders = window.PAULO_DEFAULT_CONTENT.galleryFoldersV2 || window.PAULO_DEFAULT_CONTENT.galleryFolders;
    if (data.galleryVersion !== 3) {
      data.galleryFolders = clone(defaultGalleryFolders);
      data.galleryVersion = 3;
    }
    if (data.contentVersion !== 2) {
      ["services", "events", "testimonials"].forEach((key) => {
        const defaults = window.PAULO_DEFAULT_CONTENT[key] || [];
        (data[key] || []).forEach((item) => {
          const fresh = defaults.find((entry) => entry.slug && entry.slug === item.slug);
          if (fresh && fresh.image) item.image = fresh.image;
        });
      });
      data.contentVersion = 2;
    }
    ["services", "events"].forEach((key) => {
      data[key] = data[key] || [];
      const existing = new Set(data[key].map((item) => item.slug));
      window.PAULO_DEFAULT_CONTENT[key].forEach((item) => {
        if (!existing.has(item.slug)) data[key].push(clone(item));
      });
    });
    return data;
  }

  async function saveContent() {
    try {
      const response = await fetch("/api/content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(content)
      });
      if (!response.ok) throw new Error("Save failed");
      localStorage.setItem(storageKey, JSON.stringify(content));
      showNotice("Alterações guardadas no servidor.");
    } catch (error) {
      showNotice("Erro ao guardar. Faça login novamente se a sessão expirou.");
    }
  }

  async function loadRequests() {
    try {
      const response = await fetch("/api/requests", { cache: "no-store" });
      if (!response.ok) throw new Error("Requests unavailable");
      requests = await response.json();
      requestsError = "";
    } catch (error) {
      requests = [];
      requestsError = "Não foi possível carregar os pedidos. Termine sessão, volte a entrar e confirme que está a usar o domínio correto.";
    }
  }

  async function deleteRequest(id) {
    const response = await fetch(`/api/requests/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      showNotice("Erro ao eliminar pedido.");
      return;
    }
    requests = requests.filter((entry) => entry.id !== id);
    renderRequests();
    showNotice("Pedido eliminado.");
  }

  function showNotice(message) {
    const target = app.hidden ? loginNotice : notice;
    target.textContent = message;
    target.hidden = false;
    setTimeout(() => target.hidden = true, 3200);
  }

  async function renderShell() {
    login.hidden = Boolean(role);
    app.hidden = !role;
    if (!role) return;
    roleLabel.textContent = role === "super" ? "Super Admin" : "Paulo / Content Admin";
    await renderTab(activeTab);
  }

  async function renderTab(tab) {
    activeTab = tab;
    document.querySelectorAll("[data-tabs] button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    document.querySelectorAll("[data-panel]").forEach((panel) => panel.hidden = panel.dataset.panel !== tab);
    const labels = { summary: "Resumo", events: "Eventos", services: "Serviços & Preços", testimonials: "Testemunhos", requests: "Pedidos", galleryFolders: "Galeria", settings: "Definições" };
    title.textContent = labels[tab];
    if (tab === "summary") renderSummary();
    if (tab === "events") renderCollection("events");
    if (tab === "services") renderCollection("services");
    if (tab === "testimonials") renderCollection("testimonials");
    if (tab === "requests") {
      panel("requests").innerHTML = `<article class="editor-card"><h3>A carregar pedidos...</h3></article>`;
      await loadRequests();
      renderRequests();
    }
    if (tab === "galleryFolders") renderCollection("galleryFolders");
    if (tab === "settings") renderObject("settings", content.settings);
  }

  function renderSummary() {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = content.events.filter((event) => event.published && event.date >= today).length;
    const activeServices = content.services.filter((service) => service.active).length;
    panel("summary").innerHTML = `<div class="admin-grid">
      <article class="admin-card"><p class="eyebrow">Próximos Eventos</p><strong>${upcoming}</strong><button class="ghost-button" data-goto="events">+ Adicionar Evento</button></article>
      <article class="admin-card"><p class="eyebrow">Serviços</p><strong>${activeServices}</strong><button class="ghost-button" data-goto="services">Gerir Serviços</button></article>
      <article class="admin-card"><p class="eyebrow">Pedidos</p><strong>${requests.length}</strong><button class="ghost-button" data-goto="requests">Ver pedidos</button></article>
    </div>`;
    panel("summary").querySelectorAll("[data-goto]").forEach((button) => button.addEventListener("click", () => renderTab(button.dataset.goto)));
  }

  function panel(name) {
    return document.querySelector(`[data-panel="${name}"]`);
  }

  function renderCollection(type) {
    const node = panel(type);
    const addLabel = { events: "+ Adicionar Evento", services: "+ Adicionar Serviço", testimonials: "+ Adicionar Testemunho", galleryFolders: "+ Adicionar Pasta" }[type];
    node.innerHTML = `<div class="admin-actions"><button class="ghost-button" data-add>${addLabel}</button></div><div class="editor-list"></div>`;
    node.querySelector("[data-add]").addEventListener("click", () => {
      content[type].push(blank(type));
      renderCollection(type);
    });
    const list = node.querySelector(".editor-list");
    content[type].forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "editor-card";
      card.innerHTML = `<header><h3>${item.title || item.client || "Novo item"}</h3><button class="ghost-button danger" data-delete>Eliminar</button></header>${fieldsFor(type, item, index)}`;
      card.querySelector("[data-delete]").addEventListener("click", () => {
        content[type].splice(index, 1);
        renderCollection(type);
      });
      list.appendChild(card);
    });
    bindInputs(node);
  }

  function renderObject(type, object) {
    panel(type).innerHTML = `<article class="editor-card">${fieldsFor(type, object)}</article>`;
    bindInputs(panel(type));
  }

  function renderRequests() {
    const node = panel("requests");
    if (requestsError) {
      node.innerHTML = `<article class="editor-card"><h3>Erro ao carregar pedidos</h3><p>${requestsError}</p><button class="ghost-button" data-refresh-requests>Atualizar pedidos</button></article>`;
      node.querySelector("[data-refresh-requests]").addEventListener("click", () => renderTab("requests"));
      return;
    }
    if (!requests.length) {
      node.innerHTML = `<article class="editor-card"><h3>Sem pedidos recebidos</h3><p>Quando alguém enviar o formulário de contacto, o pedido aparece aqui.</p><button class="ghost-button" data-refresh-requests>Atualizar pedidos</button></article>`;
      node.querySelector("[data-refresh-requests]").addEventListener("click", () => renderTab("requests"));
      return;
    }
    node.innerHTML = `<div class="admin-actions"><button class="ghost-button" data-refresh-requests>Atualizar pedidos</button></div><div class="editor-list">${requests.map((entry) => `
      <article class="editor-card request-card">
        <header>
          <div><p class="eyebrow">${formatRequestDate(entry.createdAt)}</p><h3>${escapeText(entry.name || "Pedido sem nome")}</h3></div>
          <button class="ghost-button danger" data-delete-request="${escapeValue(entry.id)}">Eliminar</button>
        </header>
        <div class="request-grid">
          <p><strong>Email</strong><br><a href="mailto:${escapeValue(entry.email)}">${escapeText(entry.email)}</a></p>
          <p><strong>Telefone</strong><br>${entry.phone ? `<a href="tel:${escapeValue(entry.phone)}">${escapeText(entry.phone)}</a>` : "-"}</p>
          <p><strong>Cão</strong><br>${escapeText([entry.dogName, entry.dogAge].filter(Boolean).join(" · ") || "-")}</p>
          <p><strong>Preferência</strong><br>${escapeText(entry.contactPreference || "-")}</p>
          <p class="wide"><strong>Motivo</strong><br>${escapeText(entry.reason || "-")}</p>
          <p class="wide"><strong>Mensagem</strong><br>${escapeText(entry.message || "-")}</p>
        </div>
      </article>`).join("")}</div>`;
    node.querySelector("[data-refresh-requests]").addEventListener("click", () => renderTab("requests"));
    node.querySelectorAll("[data-delete-request]").forEach((button) => {
      button.addEventListener("click", () => deleteRequest(button.dataset.deleteRequest));
    });
  }

  function formatRequestDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  function textField(label, path, value, wide = false, type = "text") {
    return `<label class="${wide ? "wide" : ""}">${label}<input type="${type}" value="${escapeValue(value)}" data-path="${path}"></label>`;
  }

  function imageField(label, path, value, wide = false) {
    return `<label class="${wide ? "wide" : ""}">${label}<input type="text" value="${escapeValue(value)}" data-path="${path}"><span class="upload-row"><input type="file" accept="image/*" data-upload-path="${path}" hidden><button class="ghost-button upload-button" type="button" data-upload-button="${path}">+ Carregar foto</button></span></label>`;
  }

  function areaField(label, path, value) {
    return `<label class="wide">${label}<textarea data-path="${path}">${escapeText(value)}</textarea></label>`;
  }

  function checkField(label, path, value) {
    return `<label class="check-row"><input type="checkbox" ${value ? "checked" : ""} data-path="${path}">${label}</label>`;
  }

  function gallerySelectField(label, path, value) {
    const options = [`<option value="">Sem galeria associada</option>`]
      .concat((content.galleryFolders || []).map((folder) => `<option value="${escapeValue(folder.slug)}" ${folder.slug === value ? "selected" : ""}>${escapeText(folder.title)}</option>`));
    return `<label>${label}<select data-path="${path}">${options.join("")}</select></label>`;
  }

  function fieldsFor(type, item, index) {
    const prefix = typeof index === "number" ? `${type}.${index}` : type;
    if (type === "services") return `<div class="admin-form-grid">
      ${textField("Título", `${prefix}.title`, item.title)}${textField("Slug", `${prefix}.slug`, item.slug)}
      ${imageField("Imagem", `${prefix}.image`, item.image, true)}${areaField("Descrição curta", `${prefix}.short`, item.short)}
      ${areaField("Descrição completa", `${prefix}.long`, item.long)}${textField("Preço prefixo", `${prefix}.pricePrefix`, item.pricePrefix)}
      ${textField("Preço", `${prefix}.price`, item.price)}${textField("Duração", `${prefix}.duration`, item.duration)}
      ${textField("Ordem", `${prefix}.order`, item.order, false, "number")}${checkField("Ativo", `${prefix}.active`, item.active)}
    </div>`;
    if (type === "events") return `<div class="admin-form-grid">
      ${textField("Título", `${prefix}.title`, item.title)}
      ${imageField("Imagem", `${prefix}.image`, item.image, true)}${textField("Data", `${prefix}.date`, item.date, false, "date")}
      ${textField("Hora", `${prefix}.time`, item.time, false, "time")}
      ${textField("Local", `${prefix}.location`, item.location)}${textField("Preço", `${prefix}.price`, item.price)}
      ${gallerySelectField("Galeria associada", `${prefix}.gallerySlug`, item.gallerySlug || "")}
      ${areaField("Descrição curta", `${prefix}.short`, item.short)}
      ${areaField("Descrição completa", `${prefix}.full`, item.full)}${checkField("Publicado", `${prefix}.published`, item.published)}${checkField("Destaque", `${prefix}.featured`, item.featured)}
    </div>`;
    if (type === "testimonials") return `<div class="admin-form-grid">
      ${textField("Cliente", `${prefix}.client`, item.client)}${textField("Nome do cão", `${prefix}.dog`, item.dog)}
      ${textField("Rating", `${prefix}.rating`, item.rating, false, "number")}${textField("Fonte", `${prefix}.source`, item.source)}
      ${imageField("Imagem", `${prefix}.image`, item.image, true)}${areaField("Testemunho", `${prefix}.text`, item.text)}
      ${checkField("Publicado", `${prefix}.published`, item.published)}${checkField("Destaque", `${prefix}.featured`, item.featured)}
    </div>`;
    if (type === "galleryFolders") return `<div class="admin-form-grid">
      ${textField("Título da pasta", `${prefix}.title`, item.title)}${textField("Slug para partilhar", `${prefix}.slug`, item.slug)}
      ${textField("Data", `${prefix}.date`, item.date, false, "date")}${imageField("Imagem de capa", `${prefix}.cover`, item.cover)}
      ${areaField("Descrição", `${prefix}.description`, item.description)}
      <label class="wide">Media da pasta<span class="folder-upload"><input type="file" accept="image/*" multiple data-upload-media="${prefix}" hidden><button class="ghost-button upload-button" type="button" data-upload-media-button="${prefix}">+ Carregar fotos para a pasta</button></span><textarea data-path="${prefix}.mediaText">${mediaToText(item.media)}</textarea><small>Uma linha por item: tipo|caminho|legenda. Exemplo: video|videos/ficheiro.mp4|Caminhada social</small></label>
      ${checkField("Publicado", `${prefix}.published`, item.published)}
    </div>`;
    if (type === "settings") return `<div class="admin-form-grid">
      ${textField("Marca", "settings.brand", item.brand)}${textField("Telefone", "settings.phone", item.phone)}
      ${textField("Email", "settings.email", item.email)}${textField("Localização", "settings.location", item.location)}
      ${textField("Área de serviço", "settings.serviceArea", item.serviceArea, true)}${textField("Facebook URL", "settings.facebook", item.facebook)}
      ${textField("Instagram URL", "settings.instagram", item.instagram)}${textField("WhatsApp URL", "settings.whatsapp", item.whatsapp)}
    </div>`;
    return "";
  }

  function blank(type) {
    if (type === "services") return { slug: "novo-servico", active: true, order: content.services.length + 1, title: "Novo serviço", image: "", short: "", long: "", pricePrefix: "Desde", price: "Sob consulta", duration: "", included: ["Avaliação", "Plano", "Acompanhamento"] };
    if (type === "events") return { slug: "novo-evento", published: false, featured: false, title: "Novo evento", image: "", date: "", time: "", location: "", price: "5€", gallerySlug: "", registrationLink: "contacto/", short: "", full: "" };
    if (type === "galleryFolders") return { slug: "nova-pasta", published: true, title: "Nova pasta", date: new Date().toISOString().slice(0, 10), description: "", cover: "", media: [], mediaText: "" };
    return { published: false, featured: false, client: "Cliente", dog: "", rating: 5, source: "Facebook", image: "", text: "" };
  }

  function bindInputs(node) {
    node.querySelectorAll("[data-path]").forEach((input) => {
      const update = () => {
        const value = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
        setValue(input.dataset.path, value);
      };
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    });
    node.querySelectorAll("[data-upload-button]").forEach((button) => {
      button.addEventListener("click", () => {
        node.querySelector(`[data-upload-path="${cssEscape(button.dataset.uploadButton)}"]`).click();
      });
    });
    node.querySelectorAll("[data-upload-path]").forEach((input) => {
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          await uploadImage(file, input.dataset.uploadPath);
        } catch (error) {
          showNotice("Erro ao carregar foto.");
        }
        input.value = "";
      });
    });
    node.querySelectorAll("[data-upload-media-button]").forEach((button) => {
      button.addEventListener("click", () => {
        node.querySelector(`[data-upload-media="${cssEscape(button.dataset.uploadMediaButton)}"]`).click();
      });
    });
    node.querySelectorAll("[data-upload-media]").forEach((input) => {
      input.addEventListener("change", async () => {
        const files = Array.from(input.files || []);
        if (!files.length) return;
        try {
          await uploadFolderImages(files, input.dataset.uploadMedia, node);
        } catch (error) {
          showNotice("Erro ao carregar fotos.");
        }
        input.value = "";
      });
    });
  }

  async function uploadImage(file, keyPath) {
    if (!file.type.startsWith("image/")) {
      showNotice("Escolha um ficheiro de imagem.");
      return;
    }
    showNotice("A carregar foto...");
    const uploadedPath = await sendUpload(file);
    setValue(keyPath, uploadedPath);
    const input = document.querySelector(`[data-path="${cssEscape(keyPath)}"]`);
    if (input) input.value = uploadedPath;
    showNotice("Foto carregada. Clique em Guardar alterações.");
  }

  async function uploadFolderImages(files, prefix, node) {
    showNotice("A carregar fotos...");
    const folder = valueAt(prefix);
    folder.media = folder.media || [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const uploadedPath = await sendUpload(file);
      folder.media.push({ type: "image", src: uploadedPath, caption: folder.title || "Galeria" });
    }
    folder.mediaText = mediaToText(folder.media);
    const textarea = node.querySelector(`[data-path="${cssEscape(prefix + ".mediaText")}"]`);
    if (textarea) textarea.value = folder.mediaText;
    showNotice("Fotos adicionadas. Clique em Guardar alterações.");
  }

  async function sendUpload(file) {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", body: form });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Upload failed");
    return payload.path;
  }

  function valueAt(keyPath) {
    return keyPath.split(".").reduce((target, part) => target && target[part], content);
  }

  function cssEscape(value) {
    return (window.CSS && CSS.escape) ? CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
  }

  function setValue(keyPath, value) {
    const parts = keyPath.split(".");
    let target = content;
    while (parts.length > 1) target = target[parts.shift()];
    if (parts[0] === "mediaText") {
      target.media = textToMedia(value);
      target.mediaText = value;
      return;
    }
    target[parts[0]] = value;
  }

  function mediaToText(media) {
    return (media || []).map((item) => `${item.type || "image"}|${item.src || ""}|${item.caption || ""}`).join("\n");
  }

  function textToMedia(value) {
    return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [type, src, caption] = line.split("|");
      return { type: type === "video" ? "video" : "image", src: src || "", caption: caption || "" };
    }).filter((item) => item.src);
  }

  function escapeValue(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  }

  function escapeText(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  }

  document.querySelector("[data-login-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: form.get("role"), password: form.get("password") })
    });
    if (!response.ok) {
      showNotice("Password incorreta.");
      return;
    }
    role = (await response.json()).role;
    content = await loadContent();
    await loadRequests();
    renderShell();
  });

  document.querySelector("[data-tabs]").addEventListener("click", (event) => {
    if (event.target.matches("[data-tab]")) renderTab(event.target.dataset.tab);
  });
  document.querySelector("[data-save]").addEventListener("click", saveContent);
  document.querySelector("[data-logout]").addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    role = "";
    renderShell();
  });
  async function boot() {
    const session = await fetch("/api/session", { cache: "no-store" }).then((response) => response.json()).catch(() => ({ authenticated: false }));
    role = session.authenticated ? session.role : "";
    content = await loadContent();
    if (role) await loadRequests();
    renderShell();
  }

  boot();
})();
