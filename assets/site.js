(function () {
  const depth = Number(document.documentElement.dataset.depth || 0);
  const root = "../".repeat(depth);
  const storageKey = "pauloRebeloContent";
  const today = new Date();

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function getContent() {
    const fallback = clone(window.PAULO_DEFAULT_CONTENT);
    try {
      const response = await fetch("/api/content", { cache: "no-store" });
      if (response.ok) return normalizeContent(await response.json());
    } catch (error) {
      // Static fallback for local file previews.
    }
    try {
      const saved = localStorage.getItem(storageKey);
      return normalizeContent(saved ? JSON.parse(saved) : fallback);
    } catch (error) {
      return normalizeContent(fallback);
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
      ["services", "posts", "events", "testimonials"].forEach((key) => {
        const defaults = window.PAULO_DEFAULT_CONTENT[key] || [];
        (data[key] || []).forEach((item) => {
          const fresh = defaults.find((entry) => entry.slug && entry.slug === item.slug);
          if (fresh && fresh.image) item.image = fresh.image;
        });
      });
      data.contentVersion = 2;
    }
    ["services", "posts", "events"].forEach((key) => {
      data[key] = data[key] || [];
      const existing = new Set((data[key] || []).map((item) => item.slug));
      window.PAULO_DEFAULT_CONTENT[key].forEach((item) => {
        if (!existing.has(item.slug)) data[key].push(clone(item));
      });
    });
    return data;
  }

  function saveContent(content) {
    localStorage.setItem(storageKey, JSON.stringify(content));
  }

  function path(to) {
    if (!to) return "#";
    if (/^(https?:|mailto:|tel:|#)/.test(to)) return to;
    return root + to.replace(/^\/+/, "");
  }

  function img(src) {
    return src ? path(src) : path("Pictures/763103798_1067937529145582_5245601540913434113_n.jpeg");
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value + "T12:00:00"));
  }

  function todayISO() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  }

  function future(item) {
    return item.published && item.date && item.date >= todayISO();
  }

  function stars(count) {
    return "★★★★★".slice(0, Number(count || 5));
  }

  function activeServices(data) {
    return [...data.services].filter((item) => item.active).sort((a, b) => a.order - b.order);
  }

  function el(selector) {
    return document.querySelector(selector);
  }

  function renderHeader(data) {
    const header = el("[data-header]");
    if (!header) return;
    header.innerHTML = `
      <a class="brand" href="${path("index.html")}" aria-label="Início">${data.settings.brand}</a>
      <button class="menu-toggle" type="button" aria-label="Abrir menu" data-menu-toggle><span></span><span></span></button>
      <nav class="nav" data-nav>
        <a href="${path("index.html")}">Início</a>
        <a href="${path("sobre/")}">Sobre</a>
        <a href="${path("servicos/")}">Serviços</a>
        <a href="${path("index.html#metodo")}">Método</a>
        <a href="${path("index.html#resultados")}">Resultados</a>
        <a href="${path("testemunhos/")}">Testemunhos</a>
        <a href="${path("novidades/")}">Novidades</a>
        <a href="${path("galeria/")}">Galeria</a>
        <a href="${path("contacto/")}">Contacto</a>
      </nav>
      <button class="lang-toggle" type="button" data-lang-toggle aria-label="Switch language">EN</button>
      <div class="header-actions">
        <a class="icon-link" href="tel:+351${data.settings.phone.replace(/\s/g, "")}" aria-label="Ligar">☎</a>
        <a class="button button-small" href="${path("contacto/")}">Marcar Avaliação</a>
      </div>`;
    const toggle = header.querySelector("[data-menu-toggle]");
    const nav = header.querySelector("[data-nav]");
    toggle.addEventListener("click", () => nav.classList.toggle("is-open"));
    header.querySelector("[data-lang-toggle]").addEventListener("click", () => {
      const next = currentLang() === "pt" ? "en" : "pt";
      localStorage.setItem("pauloLang", next);
      window.location.reload();
    });
  }

  function renderFooter(data) {
    const footer = el("[data-footer]");
    if (!footer) return;
    footer.innerHTML = `
      <div class="footer-grid">
        <div><h3>Paulo Rebelo</h3><p>Especialista em comportamento canino e treino personalizado nos Açores desde 2003.</p></div>
        <div><h3>Navegação</h3><a href="${path("sobre/")}">Sobre</a><a href="${path("servicos/")}">Serviços</a><a href="${path("testemunhos/")}">Testemunhos</a><a href="${path("novidades/")}">Novidades</a><a href="${path("galeria/")}">Galeria</a><a href="${path("contacto/")}">Contacto</a></div>
        <div><h3>Contacto</h3><a href="tel:+351${data.settings.phone.replace(/\s/g, "")}">${data.settings.phone}</a><a href="mailto:${data.settings.email}">${data.settings.email}</a><span>${data.settings.location}</span></div>
        <div><h3>Redes</h3><a href="${data.settings.facebook}">Facebook</a><a href="${data.settings.instagram}">Instagram</a></div>
      </div>
      <div class="footer-bottom"><span>© 2026 ${data.settings.brand}</span><span>Privacidade · Cookies · Termos</span></div>`;
  }

  function serviceCard(item) {
    return `
      <article class="service-card reveal">
        <a href="${path("servicos/" + item.slug + "/")}"><img src="${img(item.image)}" alt="${item.title}" loading="lazy"></a>
        <div>
          <p class="eyebrow">${item.duration}</p>
          <h3>${item.title}</h3>
          <p>${item.short}</p>
          <p class="price">${item.pricePrefix} ${item.price}</p>
          <a class="text-link" href="${path("servicos/" + item.slug + "/")}">Saber mais</a>
        </div>
      </article>`;
  }

  function renderHome(data) {
    if (!document.body.matches("[data-page='home']")) return;
    const hero = el("[data-hero]");
    hero.style.backgroundImage = `linear-gradient(90deg, rgba(18,19,17,.78), rgba(18,19,17,.34), rgba(18,19,17,.1)), url('${img("Pictures/763103798_1067937529145582_5245601540913434113_n.jpeg")}')`;
    const highlight = el("[data-highlight]");
    if (data.highlight.active && (!data.highlight.expires || new Date(data.highlight.expires + "T23:59:59") >= today)) {
      highlight.innerHTML = `<strong>${data.highlight.title}</strong><span>${data.highlight.text}</span><a href="${path(data.highlight.ctaLink)}">${data.highlight.ctaLabel}</a>`;
    } else {
      highlight.remove();
    }
    el("[data-services]").innerHTML = activeServices(data).slice(0, 6).map(serviceCard).join("");
    const featuredFolder = data.galleryFolders.find((folder) => folder.published) || { media: [] };
    el("[data-gallery]").innerHTML = featuredFolder.media.slice(0, 5).map((item, index) => mediaFigure(item, index === 0)).join("");
    el("[data-testimonials]").innerHTML = data.testimonials.filter((t) => t.published && t.featured).slice(0, 3).map(testimonialCard).join("");
    const publishedEvents = data.events.filter((event) => event.published);
    const upcomingEvents = publishedEvents
      .filter(future)
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    const pastEvents = publishedEvents
      .filter((event) => !future(event))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const posts = [...upcomingEvents, ...pastEvents]
      .slice(0, 3)
      .map((event) => ({ ...event, category: "Evento" }));
    const news = el("[data-news-section]");
    if (posts.length) el("[data-news]").innerHTML = posts.map(postCard).join("");
    else news.remove();
    const featured = data.events.find((event) => event.featured && future(event));
    const eventSection = el("[data-featured-event]");
    if (featured) {
      eventSection.innerHTML = `<img src="${img(featured.image)}" alt="${featured.title}" loading="lazy"><div><p class="eyebrow">Evento em destaque</p><h2>${featured.title}</h2><p>${featured.short}</p><dl><div><dt>Data</dt><dd>${formatDate(featured.date)}</dd></div><div><dt>Hora</dt><dd>${featured.time}</dd></div><div><dt>Local</dt><dd>${featured.location}</dd></div><div><dt>Preço</dt><dd>${featured.price}</dd></div></dl><a class="button" href="${path((featured.registrationLink || "contacto/") + "?motivo=" + featured.slug)}">Inscrever-me</a></div>`;
    } else {
      eventSection.remove();
    }
  }

  function testimonialCard(t) {
    return `<article class="testimonial-card reveal"><p class="stars">${stars(t.rating)}</p><blockquote>${t.text}</blockquote><footer><span>${t.client}${t.dog ? " · " + t.dog : ""}</span><small>${t.source}</small></footer></article>`;
  }

  function postCard(p) {
    const base = p.category === "Evento" ? "eventos/" : "novidades/";
    const displayDate = p.dateLabel || formatDate(p.date);
    return `<article class="post-card reveal"><img src="${img(p.image)}" alt="${p.title}" loading="lazy"><div><p class="eyebrow">${p.category} · ${displayDate}</p><h3>${p.title}</h3><p>${p.short}</p><a class="text-link" href="${p.externalLink || path(base + p.slug + "/")}">Ler mais</a></div></article>`;
  }

  function renderServices(data) {
    if (!document.body.matches("[data-page='services']")) return;
    el("[data-service-list]").innerHTML = activeServices(data).map(serviceCard).join("");
  }

  function renderServiceDetail(data) {
    if (!document.body.matches("[data-page='service-detail']")) return;
    const slug = document.body.dataset.service;
    const item = activeServices(data).find((service) => service.slug === slug) || activeServices(data)[0];
    document.title = `${item.title} · Paulo Rebelo`;
    el("[data-service-detail]").innerHTML = `
      <section class="page-hero image-hero" style="background-image: linear-gradient(90deg, rgba(18,19,17,.76), rgba(18,19,17,.25)), url('${img(item.image)}')">
        <div><p class="eyebrow">Serviço</p><h1>${item.title}</h1><p>${item.long}</p><a class="button" href="${path("contacto/")}">Marcar Avaliação</a></div>
      </section>
      <section class="section two-col">
        <div><p class="eyebrow">Para quem é</p><h2>Intervenção definida depois de compreender o cão e o contexto.</h2></div>
        <div><p>${item.short}</p><p>Antes de avançar, Paulo observa comportamento, rotina, ambiente, comunicação do tutor e objetivos possíveis. O plano nasce dessa avaliação.</p></div>
      </section>
      <section class="section muted"><div class="section-head"><p class="eyebrow">${item.pricePrefix} ${item.price}</p><h2>O que está incluído</h2></div><div class="step-grid">${item.included.map((x, i) => `<article><span>0${i + 1}</span><h3>${x}</h3><p>Orientação prática e ajustada ao progresso real do cão e do tutor.</p></article>`).join("")}</div></section>
      <section class="section faq"><h2>Perguntas frequentes</h2><details open><summary>É preciso avaliação antes do treino?</summary><p>Sim. A avaliação reduz decisões precipitadas e ajuda a escolher uma abordagem adequada.</p></details><details><summary>Os preços são fixos?</summary><p>Os preços são editáveis no admin e dependem do serviço, duração e acompanhamento necessário.</p></details><details><summary>Há acompanhamento remoto?</summary><p>Sim, quando fizer sentido para o caso e para os objetivos do tutor.</p></details></section>
      <section class="final-cta"><h2>Começamos por perceber o que está realmente a acontecer.</h2><a class="button light" href="${path("contacto/")}">Marcar Avaliação</a></section>`;
  }

  function renderAbout(data) {
    if (!document.body.matches("[data-page='about']")) return;
    el("[data-about-gallery]").innerHTML = ["Pictures/725649295_1673386650587475_6841746349379477318_n.jpeg", "Pictures/719863514_2048278179442521_482824212905461810_n.jpeg", "Pictures/605938698_1368597421955341_3052813529123617980_n.jpg"].map((src) => `<img src="${img(src)}" alt="Paulo Rebelo em contexto de treino" loading="lazy">`).join("");
  }

  function renderTestimonials(data) {
    if (!document.body.matches("[data-page='testimonials']")) return;
    el("[data-testimonial-list]").innerHTML = data.testimonials.filter((t) => t.published).map(testimonialCard).join("");
  }

  function renderNews(data) {
    if (!document.body.matches("[data-page='news']")) return;
    const posts = data.posts.filter((p) => p.published);
    const events = data.events
      .filter((event) => event.published)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const eventSection = el("[data-events-section]");
    const postSection = el("[data-posts-section]");
    if (events.length) el("[data-event-list]").innerHTML = events.map((event) => ({ ...event, category: "Evento" })).map(postCard).join("");
    else eventSection.remove();
    if (posts.length) el("[data-news-list]").innerHTML = posts.map(postCard).join("");
    else postSection.remove();
  }

  function mediaFigure(item, large) {
    if (item.type === "video") {
      return `<figure class="${large ? "large" : ""}"><video src="${path(item.src)}" controls muted playsinline preload="metadata"></video></figure>`;
    }
    return `<figure class="${large ? "large" : ""}"><img src="${img(item.src)}" alt="${item.caption || "Galeria de treino canino"}" loading="lazy"></figure>`;
  }

  function renderGallery(data) {
    if (!document.body.matches("[data-page='gallery']")) return;
    const folders = data.galleryFolders.filter((folder) => folder.published);
    const folderList = el("[data-gallery-folders]");
    const foldersSection = el("[data-gallery-folders-section]");
    const detailSection = el("[data-gallery-detail-section]");
    const detailHead = el("[data-gallery-detail-head]");
    const detail = el("[data-gallery-detail]");
    if (!folders.length) {
      foldersSection.remove();
      detailSection.hidden = true;
      return;
    }
    folderList.innerHTML = folders.map((folder) => `
      <article class="service-card reveal">
        <a href="${path("galeria/")}?folder=${folder.slug}"><img src="${img(folder.cover)}" alt="${folder.title}" loading="lazy"></a>
        <div><p class="eyebrow">${formatDate(folder.date)}</p><h3>${folder.title}</h3><p>${folder.description}</p><a class="text-link" href="${path("galeria/")}?folder=${folder.slug}">Abrir pasta</a></div>
      </article>`).join("");
    const selectedSlug = new URLSearchParams(window.location.search).get("folder");
    const selected = folders.find((folder) => folder.slug === selectedSlug) || folders[0];
    detailSection.hidden = false;
    detailHead.innerHTML = `<p class="eyebrow">${formatDate(selected.date)}</p><h2>${selected.title}</h2><p>${selected.description}</p><p><a class="text-link" href="${window.location.href}">Copiar link desta pasta</a></p>`;
    detail.innerHTML = selected.media.map((item, index) => mediaFigure(item, index === 0)).join("");
  }

  function renderContentDetail(data) {
    if (!document.body.matches("[data-page='content-detail']")) return;
    const kind = document.body.dataset.kind;
    const slug = document.body.dataset.slug;
    const source = kind === "event" ? data.events : data.posts;
    const item = source.find((entry) => entry.slug === slug) || source[0];
    const category = kind === "event" ? "Evento" : item.category;
    const registration = kind === "event" && future(item)
      ? `<a class="button" href="${path((item.registrationLink || "contacto/") + "?motivo=" + item.slug)}">Inscrever-me</a>`
      : kind === "event"
        ? `<p class="closed-event">Inscrições encerradas. Este evento já aconteceu.</p>`
        : `<a class="button" href="${path("contacto/")}">Falar com Paulo</a>`;
    document.title = `${item.title} · Paulo Rebelo`;
    el("[data-content-detail]").innerHTML = `
      <section class="page-hero image-hero" style="background-image: linear-gradient(90deg, rgba(18,19,17,.76), rgba(18,19,17,.25)), url('${img(item.image)}')">
        <div><p class="eyebrow">${category} · ${item.dateLabel || formatDate(item.date)}</p><h1>${item.title}</h1><p>${item.short}</p></div>
      </section>
      <section class="section two-col">
        <div><p class="eyebrow">${kind === "event" ? item.location : category}</p><h2>${kind === "event" ? "Informação do evento" : "Conteúdo escolhido para o site"}</h2></div>
        <div><p>${item.full || item.short}</p>${kind === "event" ? `<p><strong>Hora:</strong> ${item.time || "A confirmar"}<br><strong>Preço:</strong> ${item.price || "Sob consulta"}</p>` : ""}${registration}</div>
      </section>`;
  }

  function renderContact(data) {
    if (!document.body.matches("[data-page='contact']")) return;
    el("[data-contact-info]").innerHTML = `<a href="tel:+351${data.settings.phone.replace(/\s/g, "")}">${data.settings.phone}</a><a href="mailto:${data.settings.email}">${data.settings.email}</a><span>${data.settings.location}</span><a href="${data.settings.whatsapp}">WhatsApp</a>`;
    const reason = el("[data-contact-reason]");
    if (!reason) return;
    const selected = new URLSearchParams(window.location.search).get("motivo");
    const upcoming = data.events
      .filter(future)
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    const serviceOptions = [
      { value: "avaliacao-comportamental", label: "Avaliação comportamental" },
      { value: "treino-individual", label: "Treino individual" },
      { value: "educacao-canina", label: "Educação canina" },
      { value: "problemas-comportamentais", label: "Problemas comportamentais" },
      { value: "consultoria-remota", label: "Consultoria remota" },
      { value: "outro", label: "Outro assunto" }
    ];
    const eventOptions = upcoming.map((event) => ({
      value: event.slug,
      label: `${event.title} · ${event.dateLabel || formatDate(event.date)}${event.time ? " · " + event.time : ""}`
    }));
    reason.innerHTML = `
      <option value="">Escolha o motivo</option>
      <optgroup label="Marcação / avaliação">
        ${serviceOptions.map((option) => `<option value="${option.value}" ${option.value === selected ? "selected" : ""}>${option.label}</option>`).join("")}
      </optgroup>
      <optgroup label="Inscrição em evento">
        ${eventOptions.length ? eventOptions.map((option) => `<option value="${option.value}" ${option.value === selected ? "selected" : ""}>${option.label}</option>`).join("") : `<option value="sem-eventos" disabled>Sem eventos futuros disponíveis</option>`}
      </optgroup>`;
    const form = el("[data-contact-form]");
    const status = el("[data-contact-status]");
    if (!form || !status) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const selectedReason = reason.selectedOptions[0]?.textContent || "";
      status.hidden = true;
      try {
        const response = await fetch("/api/requests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: formData.get("Nome"),
            email: formData.get("Email"),
            phone: formData.get("Telefone"),
            dogName: formData.get("Nome do cão"),
            dogAge: formData.get("Idade do cão"),
            contactPreference: formData.get("Preferência de contacto"),
            reason: selectedReason,
            message: formData.get("Mensagem")
          })
        });
        if (!response.ok) throw new Error("Request failed");
        form.reset();
        status.textContent = "Pedido enviado. Paulo recebeu a informação na área de administração.";
        status.hidden = false;
      } catch (error) {
        status.textContent = "Não foi possível enviar o pedido. Tente novamente ou contacte por telefone/WhatsApp.";
        status.hidden = false;
      }
    });
  }

  function revealOnScroll() {
    const items = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("is-visible"));
    }, { threshold: 0.12 });
    items.forEach((item) => observer.observe(item));
  }

  function currentLang() {
    return localStorage.getItem("pauloLang") || "pt";
  }

  const translations = {
    "Início": "Home",
    "Sobre": "About",
    "Serviços": "Services",
    "Método": "Method",
    "Resultados": "Results",
    "Testemunhos": "Testimonials",
    "Novidades": "News",
    "Galeria": "Gallery",
    "Contacto": "Contact",
    "Marcar Avaliação": "Book Assessment",
    "Treino Canino & Comportamento Animal · Açores": "Dog Training & Animal Behaviour · Azores",
    "Compreender o cão é o primeiro passo para mudar o comportamento.": "Understanding the dog is the first step toward changing behaviour.",
    "Treino canino, avaliação comportamental e acompanhamento personalizado desde 2003.": "Dog training, behavioural assessment and personalised support since 2003.",
    "Conhecer os Serviços": "Explore Services",
    "Desde 2003": "Since 2003",
    "Experiência profissional": "Professional experience",
    "+20 anos": "20+ years",
    "Treino e comportamento canino": "Dog training and behaviour",
    "Seguidores nas redes sociais": "Social media followers",
    "100%": "100%",
    "Recomendado no Facebook": "Recommended on Facebook",
    "Agenda disponível": "Bookings available",
    "Avaliações comportamentais e treinos individuais com marcação prévia.": "Behavioural assessments and individual training by appointment.",
    "Marcar avaliação": "Book assessment",
    "Como posso ajudar?": "How can I help?",
    "Problemas reais pedem uma leitura séria antes do treino.": "Real problems need careful assessment before training.",
    "O trabalho começa por perceber o cão, a rotina, o ambiente e a comunicação do tutor.": "The work starts by understanding the dog, routine, environment and owner communication.",
    "Comportamento": "Behaviour",
    "Insegurança, ansiedade, hábitos indesejados e situações difíceis.": "Insecurity, anxiety, unwanted habits and difficult situations.",
    "Saber mais": "Learn more",
    "Obediência e Educação": "Obedience and Education",
    "Regras, passeio, comandos, rotinas e controlo no dia a dia.": "Rules, walks, commands, routines and day-to-day control.",
    "Relação Tutor-Cão": "Owner-Dog Relationship",
    "Mais clareza para interpretar comunicação, limites e necessidades.": "More clarity to interpret communication, limits and needs.",
    "Avaliação Individual": "Individual Assessment",
    "Entender a origem antes de decidir como intervir.": "Understand the root cause before deciding how to intervene.",
    "Paulo Rebelo": "Paulo Rebelo",
    "Treino Canino desde 2003": "Dog Training since 2003",
    "Paulo trabalha comportamento canino com uma abordagem calma, observadora e personalizada. Antes de propor exercícios, avalia o cão, o tutor, a rotina e o contexto onde o comportamento acontece.": "Paulo works with dog behaviour through a calm, observant and personalised approach. Before suggesting exercises, he assesses the dog, owner, routine and context where the behaviour happens.",
    "Perito em Comportamento Animal": "Animal Behaviour Specialist",
    "Cinotécnico": "Canine Technician",
    "Psicologia Canina": "Canine Psychology",
    "Comissário de Ringue CPC": "CPC Ring Steward",
    "Comunicação Animal": "Animal Communication",
    "Conhecer o Paulo": "Meet Paulo",
    "Acompanhamento adaptado ao cão, ao tutor e ao problema.": "Support adapted to the dog, owner and problem.",
    "Cada cão é diferente. O treino também deve ser.": "Every dog is different. Training should be too.",
    "O processo considera comportamento, ambiente, rotina, historial, comunicação do tutor e objetivos possíveis antes de criar um plano de treino.": "The process considers behaviour, environment, routine, history, owner communication and realistic goals before creating a training plan.",
    "Avaliar": "Assess",
    "Compreender": "Understand",
    "Comunicar": "Communicate",
    "Treinar": "Train",
    "Acompanhar": "Support",
    "Como funciona": "How it works",
    "Um processo simples, sem atalhos.": "A simple process, without shortcuts.",
    "Contacto": "Contact",
    "O tutor explica a situação e os objetivos.": "The owner explains the situation and goals.",
    "Avaliação": "Assessment",
    "Paulo observa cão, tutor, contexto e rotina.": "Paulo observes the dog, owner, context and routine.",
    "Plano": "Plan",
    "É definida uma abordagem personalizada.": "A personalised approach is defined.",
    "Acompanhamento": "Follow-up",
    "O treino evolui com orientação e ajustes.": "Training progresses with guidance and adjustments.",
    "Treino na prática": "Training in practice",
    "Momentos reais de avaliação, passeio e treino.": "Real moments of assessment, walking and training.",
    "Ver mais vídeos": "See more videos",
    "Ver galeria completa": "View full gallery",
    "100% recomendado no Facebook": "100% recommended on Facebook",
    "O que dizem os tutores": "What owners say",
    "Ver mais testemunhos": "See more testimonials",
    "Eventos, dicas e avisos escolhidos para o site.": "Events, tips and notices selected for the website.",
    "Próximos eventos e caminhadas abertas a inscrição.": "Upcoming events and walks open for registration.",
    "O comportamento do seu cão está a tornar o dia a dia mais difícil?": "Is your dog’s behaviour making daily life harder?",
    "Começamos por perceber o que está realmente a acontecer.": "We start by understanding what is really happening.",
    "Ligar": "Call",
    "Especialista em comportamento canino e treino personalizado nos Açores desde 2003.": "Specialist in dog behaviour and personalised training in the Azores since 2003.",
    "Navegação": "Navigation",
    "Redes": "Social",
    "Privacidade · Cookies · Termos": "Privacy · Cookies · Terms",
    "Sobre Paulo": "About Paulo",
    "Experiência, leitura comportamental e trabalho personalizado.": "Experience, behavioural reading and personalised work.",
    "Desde 2003, Paulo Rebelo trabalha com cães e tutores nos Açores, focando-se na compreensão do comportamento antes da intervenção.": "Since 2003, Paulo Rebelo has worked with dogs and owners in the Azores, focusing on understanding behaviour before intervention.",
    "História profissional": "Professional Story",
    "O cão, o tutor e o contexto contam a história completa.": "The dog, owner and context tell the full story.",
    "O trabalho de Paulo não parte de receitas prontas. Cada caso é observado como um conjunto de sinais: linguagem corporal, rotina, ambiente, historial, expectativas do tutor e resposta emocional do cão.": "Paulo’s work does not start from ready-made formulas. Each case is observed as a set of signals: body language, routine, environment, history, owner expectations and the dog’s emotional response.",
    "A intervenção procura ser clara, prática e honesta, com objetivos realistas e ajustados à vida diária da família.": "The intervention aims to be clear, practical and honest, with realistic goals adjusted to the family’s daily life.",
    "Galeria": "Gallery",
    "Trabalho em contexto real.": "Work in real contexts.",
    "Precisa de uma leitura profissional do comportamento do seu cão?": "Do you need a professional reading of your dog’s behaviour?",
    "Serviços & Preços": "Services & Prices",
    "Treino e comportamento canino com plano individual.": "Dog training and behaviour with an individual plan.",
    "Os serviços e preços são geridos no admin e aparecem automaticamente no site quando estão ativos.": "Services and prices are managed in the admin and appear automatically on the site when active.",
    "Marcar avaliação.": "Book an assessment.",
    "Explique a situação com o seu cão. Paulo responde por telefone, WhatsApp ou email.": "Explain the situation with your dog. Paulo replies by phone, WhatsApp or email.",
    "Treino Canino · Açores, Portugal": "Dog Training · Azores, Portugal",
    "Nome": "Name",
    "Email": "Email",
    "Telefone": "Phone",
    "Nome do cão": "Dog’s name",
    "Idade do cão": "Dog’s age",
    "Preferência de contacto": "Contact preference",
    "Motivo do contacto": "Reason for contact",
    "Mensagem": "Message",
    "Enviar pedido": "Send request",
    "Avaliação Comportamental": "Behavioural Assessment",
    "Treino Individual": "Individual Training",
    "Educação Canina": "Dog Education",
    "Problemas Comportamentais": "Behavioural Problems",
    "Consultoria Remota": "Remote Consultation",
    "Sessões para Tutores": "Owner Sessions",
    "Sob consulta": "On request",
    "Desde": "From",
    "Sessão individual": "Individual session",
    "A definir após avaliação": "Defined after assessment",
    "Plano progressivo": "Progressive plan",
    "Acompanhamento personalizado": "Personalised support",
    "Online": "Online",
    "Individual ou grupo": "Individual or group",
    "Ler mais": "Read more",
    "Evento": "Event",
    "Dica": "Tip",
    "Aviso": "Notice",
    "Evento em destaque": "Featured event",
    "Data": "Date",
    "Hora": "Time",
    "Local": "Location",
    "Preço": "Price",
    "Inscrever-me": "Register",
    "Serviço": "Service",
    "Para quem é": "Who it is for",
    "Intervenção definida depois de compreender o cão e o contexto.": "Intervention defined after understanding the dog and context.",
    "Antes de avançar, Paulo observa comportamento, rotina, ambiente, comunicação do tutor e objetivos possíveis. O plano nasce dessa avaliação.": "Before moving forward, Paulo observes behaviour, routine, environment, owner communication and possible goals. The plan comes from that assessment.",
    "O que está incluído": "What is included",
    "Orientação prática e ajustada ao progresso real do cão e do tutor.": "Practical guidance adjusted to the real progress of dog and owner.",
    "Perguntas frequentes": "FAQ",
    "É preciso avaliação antes do treino?": "Is assessment needed before training?",
    "Sim. A avaliação reduz decisões precipitadas e ajuda a escolher uma abordagem adequada.": "Yes. Assessment reduces rushed decisions and helps choose the right approach.",
    "Os preços são fixos?": "Are prices fixed?",
    "Os preços são editáveis no admin e dependem do serviço, duração e acompanhamento necessário.": "Prices are editable in the admin and depend on the service, duration and support needed.",
    "Há acompanhamento remoto?": "Is remote support available?",
    "Sim, quando fizer sentido para o caso e para os objetivos do tutor.": "Yes, when it makes sense for the case and the owner’s goals.",
    "Conteúdo escolhido para o site": "Content selected for the site",
    "Informação do evento": "Event information",
    "Falar com Paulo": "Talk to Paulo"
    ,
    "Inscrições encerradas. Este evento já aconteceu.": "Registration closed. This event has already happened.",
    "Avaliação comportamental": "Behavioural assessment",
    "Treino individual": "Individual training",
    "Educação canina": "Dog education",
    "Problemas comportamentais": "Behavioural problems",
    "Consultoria remota": "Remote consultation",
    "Outro assunto": "Other subject",
    "Escolha o motivo": "Choose a reason",
    "Marcação / avaliação": "Booking / assessment",
    "Inscrição em evento": "Event registration",
    "Sem eventos futuros disponíveis": "No upcoming events available"
    ,
    "Leitura detalhada do cão, do tutor, da rotina e do contexto antes de definir qualquer intervenção.": "Detailed reading of the dog, owner, routine and context before defining any intervention.",
    "Indicada para perceber a origem de comportamentos difíceis, insegurança, reatividade, ansiedade, conflitos ou hábitos instalados.": "Recommended to understand the origin of difficult behaviours, insecurity, reactivity, anxiety, conflicts or established habits.",
    "Análise do comportamento": "Behaviour analysis",
    "Leitura do contexto familiar": "Reading of the family context",
    "Primeiras orientações práticas": "First practical guidance",
    "Plano de acompanhamento": "Follow-up plan",
    "Sessões personalizadas para comunicação, controlo, passeio, obediência e gestão do dia a dia.": "Personalised sessions for communication, control, walking, obedience and daily management.",
    "O treino é adaptado ao cão, ao tutor e aos objetivos reais da família, sem fórmulas genéricas.": "Training is adapted to the dog, owner and the family’s real goals, without generic formulas.",
    "Objetivos claros": "Clear goals",
    "Exercícios práticos": "Practical exercises",
    "Ajustes entre sessões": "Adjustments between sessions",
    "Acompanhamento do tutor": "Owner support",
    "Bases de educação, regras, rotinas, passeio, comandos e melhor comunicação tutor-cão.": "Education foundations, rules, routines, walking, commands and better owner-dog communication.",
    "Para cães jovens ou adultos que precisam de estrutura, previsibilidade e hábitos mais equilibrados.": "For young or adult dogs who need structure, predictability and more balanced habits.",
    "Rotinas e regras": "Routines and rules",
    "Passeio e foco": "Walking and focus",
    "Comandos úteis": "Useful commands",
    "Comunicação consistente": "Consistent communication",
    "Acompanhamento para situações de medo, ansiedade, reatividade, agressividade ou comportamentos persistentes.": "Support for fear, anxiety, reactivity, aggression or persistent behaviours.",
    "O trabalho começa pela causa provável e evolui com segurança, leitura emocional e objetivos realistas.": "The work starts from the likely cause and evolves with safety, emotional reading and realistic goals.",
    "Avaliação inicial": "Initial assessment",
    "Plano faseado": "Step-by-step plan",
    "Gestão de ambiente": "Environment management",
    "Revisão de progresso": "Progress review",
    "Orientação à distância para tutores que precisam de análise, plano e acompanhamento estruturado.": "Remote guidance for owners who need analysis, a plan and structured support.",
    "Útil para dúvidas, preparação, acompanhamento entre sessões presenciais ou situações fora de São Miguel.": "Useful for questions, preparation, support between in-person sessions or cases outside São Miguel.",
    "Recolha de informação": "Information gathering",
    "Análise por vídeo": "Video analysis",
    "Plano de ação": "Action plan",
    "Follow-up remoto": "Remote follow-up",
    "Formação prática para tutores compreenderem linguagem corporal, comunicação e decisões do cão.": "Practical training for owners to understand body language, communication and the dog’s decisions.",
    "O foco é dar ferramentas ao tutor para agir com mais clareza, calma e consistência.": "The focus is giving owners tools to act with more clarity, calm and consistency.",
    "Leitura corporal": "Body language reading",
    "Comunicação": "Communication",
    "Rotina doméstica": "Home routine",
    "Prevenção de problemas": "Problem prevention",
    "Workshop de comunicação canina": "Dog communication workshop",
    "Uma sessão prática sobre leitura corporal, passeio e comunicação entre tutor e cão.": "A practical session on body language, walking and communication between owner and dog.",
    "Conteúdo editável no admin. Use este espaço para detalhes, objetivos e inscrições.": "Editable content in the admin. Use this space for details, goals and registration.",
    "Ansiedade, rotina e previsibilidade": "Anxiety, routine and predictability",
    "Muitos comportamentos difíceis melhoram quando o tutor muda primeiro a leitura da rotina.": "Many difficult behaviours improve when the owner first changes how they read the routine.",
    "Artigo curto editável no admin.": "Short article editable in the admin.",
    "Agenda de setembro com vagas limitadas": "September schedule with limited availability",
    "Marcações abertas para avaliação comportamental e acompanhamento individual.": "Bookings open for behavioural assessment and individual support.",
    "Aviso editável no admin.": "Notice editable in the admin.",
    "Avaliação e comunicação no passeio": "Assessment and communication on walks",
    "São Miguel, Açores": "São Miguel, Azores",
    "Sessão prática para observar comportamento em contexto real e ajustar comunicação no passeio.": "Practical session to observe behaviour in a real context and adjust communication on walks.",
    "Evento editável. A seção destacada desaparece automaticamente quando não existe evento publicado e futuro.": "Editable event. The featured section disappears automatically when there is no published future event.",
    "O Paulo fez uma avaliação muito cuidada, explicou cada comportamento com honestidade e deu-nos soluções adaptadas à nossa rotina.": "Paulo made a very careful assessment, explained each behaviour honestly and gave us solutions adapted to our routine.",
    "A diferença foi visível logo nas primeiras orientações. Muito conhecimento, paciência e disponibilidade.": "The difference was visible from the first guidance. Great knowledge, patience and availability.",
    "Sentimo-nos acompanhados e compreendidos. O plano respeitou a nossa vida diária e ajudou-nos a comunicar melhor com a Kira.": "We felt supported and understood. The plan respected our daily life and helped us communicate better with Kira.",
    "Profissional sério, direto e muito atento ao comportamento do cão e do tutor.": "A serious, direct professional, very attentive to the behaviour of both dog and owner."
    ,
    "Fotografias e vídeos para partilhar.": "Photos and videos to share.",
    "Pastas editáveis no admin para organizar caminhadas sociais, treinos, eventos e momentos com clientes.": "Editable folders in the admin to organize social walks, training, events and client moments.",
    "Pastas": "Folders",
    "Escolha uma galeria.": "Choose a gallery.",
    "Abrir pasta": "Open folder",
    "Copiar link desta pasta": "Copy this folder link",
    "Caminhadas sociais": "Social walks",
    "Momentos de caminhadas sociais, aproximações controladas, passeio e leitura de comportamento em ambiente real.": "Moments from social walks, controlled approaches, walking and behaviour reading in real environments.",
    "Caminhada social": "Social walk",
    "Treino em grupo": "Group training",
    "Gestão de ambiente": "Environment management",
    "Aproximação entre cães": "Dog-to-dog approach",
    "Passeio e comunicação": "Walk and communication",
    "Avaliação no exterior": "Outdoor assessment"
  };

  function translatePage() {
    const lang = currentLang();
    document.documentElement.lang = lang === "en" ? "en" : "pt";
    const button = document.querySelector("[data-lang-toggle]");
    if (button) button.textContent = lang === "en" ? "PT" : "EN";
    if (lang !== "en") return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const trimmed = node.nodeValue.trim();
      if (!trimmed || !translations[trimmed]) return;
      node.nodeValue = node.nodeValue.replace(trimmed, translations[trimmed]);
    });
    document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((field) => {
      const value = field.getAttribute("placeholder");
      if (translations[value]) field.setAttribute("placeholder", translations[value]);
    });
  }

  async function init() {
    const data = await getContent();
    window.PauloSite = { getContent, saveContent, path, img, formatDate, storageKey };
    renderHeader(data);
    renderFooter(data);
    renderHome(data);
    renderServices(data);
    renderServiceDetail(data);
    renderAbout(data);
    renderTestimonials(data);
    renderNews(data);
    renderGallery(data);
    renderContentDetail(data);
    renderContact(data);
    translatePage();
    revealOnScroll();
  }

  init();
})();
