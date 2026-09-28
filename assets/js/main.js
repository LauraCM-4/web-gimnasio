/* GIMNASIO CALERA — comportamiento del sitio */
(function () {
  "use strict";

  /* Menú móvil */
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var isOpen = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* Año dinámico en el footer */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* Galería con lightbox */
  var galleryLinks = document.querySelectorAll(".gallery a[data-full]");
  var lightbox = document.querySelector(".lightbox");
  if (galleryLinks.length && lightbox) {
    var lbImg = lightbox.querySelector("img");
    var lbCaption = lightbox.querySelector(".lightbox-caption");
    var closeBtn = lightbox.querySelector(".lightbox-close");

    function openLightbox(link) {
      lbImg.src = link.getAttribute("data-full");
      lbImg.alt = link.querySelector("img").alt || "";
      lbCaption.textContent = link.getAttribute("data-caption") || "";
      lightbox.classList.add("is-open");
      closeBtn.focus();
      document.body.style.overflow = "hidden";
    }
    function closeLightbox() {
      lightbox.classList.remove("is-open");
      lbImg.src = "";
      document.body.style.overflow = "";
    }

    galleryLinks.forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        openLightbox(link);
      });
    });
    closeBtn.addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && lightbox.classList.contains("is-open")) closeLightbox();
    });
  }

  /* Reserva de plazas en clases dirigidas (aforo máx. 16 por clase) */
  var bookingGrid = document.querySelector("#reserva-grid");
  var bookingForm = document.querySelector("#reserva-form");
  if (bookingGrid && bookingForm) {
    var CAPACITY = 16;
    var STORAGE_KEY = "calera-reservas-v1";

    var CLASSES = [
      // LUNES
      { id: "lun-0800", day: "Lunes", time: "08:00", name: "Ciclo Indoor", trainer: "Sara" },
      { id: "lun-1000", day: "Lunes", time: "10:00", name: "Movilidad", trainer: "Clara" },
      { id: "lun-1300", day: "Lunes", time: "13:00", name: "HIIT", trainer: "David" },
      { id: "lun-1900", day: "Lunes", time: "19:00", name: "HIIT", trainer: "David" },
      { id: "lun-2030", day: "Lunes", time: "20:30", name: "Movilidad", trainer: "Clara" },

      // MARTES
      { id: "mar-1000", day: "Martes", time: "10:00", name: "Funcional", trainer: "Iván" },
      { id: "mar-1730", day: "Martes", time: "17:30", name: "Ciclo Indoor", trainer: "Sara" },
      { id: "mar-1900", day: "Martes", time: "19:00", name: "Funcional", trainer: "Iván" },

      // MIÉRCOLES
      { id: "mie-0800", day: "Miércoles", time: "08:00", name: "Ciclo Indoor", trainer: "Sara" },
      { id: "mie-1000", day: "Miércoles", time: "10:00", name: "Movilidad", trainer: "Clara" },
      { id: "mie-1300", day: "Miércoles", time: "13:00", name: "HIIT", trainer: "David" },
      { id: "mie-1900", day: "Miércoles", time: "19:00", name: "HIIT", trainer: "David" },
      { id: "mie-2030", day: "Miércoles", time: "20:30", name: "Movilidad", trainer: "Clara" },

      // JUEVES
      { id: "jue-1000", day: "Jueves", time: "10:00", name: "Funcional", trainer: "Iván" },
      { id: "jue-1730", day: "Jueves", time: "17:30", name: "Ciclo Indoor", trainer: "Sara" },
      { id: "jue-1900", day: "Jueves", time: "19:00", name: "Funcional", trainer: "Iván" },

      // VIERNES
      { id: "vie-0800", day: "Viernes", time: "08:00", name: "Ciclo Indoor", trainer: "Sara" },
      { id: "vie-1000", day: "Viernes", time: "10:00", name: "Movilidad", trainer: "Clara" },
      { id: "vie-1300", day: "Viernes", time: "13:00", name: "HIIT", trainer: "David" },
      { id: "vie-1900", day: "Viernes", time: "19:00", name: "HIIT", trainer: "David" },

      // SÁBADO
      { id: "sab-0800", day: "Sábado", time: "08:00", name: "Funcional", trainer: "Iván" }
    ];

    /* Identifica la semana actual por la fecha de su lunes (00:00) */
    function currentWeekKey() {
      var d = new Date();
      d.setHours(0, 0, 0, 0);
      var daysSinceMonday = (d.getDay() + 6) % 7; // lunes = 0, domingo = 6
      d.setDate(d.getDate() - daysSinceMonday);
      return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    }

    function readBookings() {
      try {
        var data = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
        if (data && data.week === currentWeekKey() && data.counts) {
          return data.counts;
        }
      } catch (e) {}
      return {}; // semana nueva (o sin datos): todo a 16/16
    }

    function writeBookings(counts) {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ week: currentWeekKey(), counts: counts })
        );
      } catch (e) {
        /* almacenamiento no disponible: la reserva no se podrá recordar al recargar */
      }
    }

    var select = bookingForm.querySelector("#class-select");

    function spotsLeft(cls, bookings) {
      var taken = bookings[cls.id] || 0;
      return Math.max(0, CAPACITY - taken);
    }

    function render() {
      var bookings = readBookings();

      bookingGrid.innerHTML = "";
      CLASSES.forEach(function (cls) {
        var left = spotsLeft(cls, bookings);
        var full = left === 0;

        var card = document.createElement("article");
        card.className = "service" + (full ? " is-full" : "");
        card.style.borderTopColor = full ? "var(--steel-400)" : "var(--ember-500)";

        var badge = full
          ? '<span style="color:var(--steel-400); font-weight:700;">Completo</span>'
          : '<span style="color:var(--ember-500); font-weight:700;">' + left + ' / ' + CAPACITY + ' plazas libres</span>';

        card.innerHTML =
          '<p style="font-family:var(--font-display); font-size:1.1rem; margin-bottom:.1em;">' + cls.day + ' · ' + cls.time + '</p>' +
          '<h3 style="margin-bottom:.15em;">' + cls.name + '</h3>' +
          '<p style="color:var(--graphite-700); margin-bottom:.6em;">Entrenador: ' + cls.trainer + '</p>' +
          '<p style="margin-bottom:1em;">' + badge + '</p>' +
          '<button type="button" class="btn ' + (full ? 'btn--outline' : 'btn--primary') + ' btn--block" data-pick="' + cls.id + '"' + (full ? ' disabled' : '') + '>' +
          (full ? 'Completo' : 'Elegir esta clase') +
          '</button>';

        bookingGrid.appendChild(card);
      });

      /* Repoblar el desplegable del formulario */
      var currentValue = select.value;
      select.innerHTML = '<option value="">Selecciona una clase…</option>';
      CLASSES.forEach(function (cls) {
        var left = spotsLeft(cls, bookings);
        var opt = document.createElement("option");
        opt.value = cls.id;
        opt.textContent = cls.day + " " + cls.time + " — " + cls.name + (left === 0 ? " (Completo)" : " (" + left + " libres)");
        if (left === 0) opt.disabled = true;
        select.appendChild(opt);
      });
      if (currentValue) select.value = currentValue;

      bookingGrid.querySelectorAll("[data-pick]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          select.value = btn.getAttribute("data-pick");
          bookingForm.scrollIntoView({ behavior: "smooth", block: "start" });
          select.focus();
        });
      });
    }

    bookingForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = bookingForm.querySelector(".form-status");
      var name = bookingForm.querySelector("#r-name");
      var email = bookingForm.querySelector("#r-email");
      var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!name.value.trim()) {
        status.textContent = "Escribe tu nombre para poder reservar.";
        status.className = "form-status is-error";
        name.focus();
        return;
      }
      if (email.value.trim() && !emailPattern.test(email.value.trim())) {
        status.textContent = "Ese email no parece válido, corrígelo o déjalo en blanco.";
        status.className = "form-status is-error";
        email.focus();
        return;
      }
      if (!select.value) {
        status.textContent = "Elige una clase de la lista.";
        status.className = "form-status is-error";
        return;
      }

      var bookings = readBookings();
      var cls = CLASSES.find(function (c) { return c.id === select.value; });
      var left = spotsLeft(cls, bookings);

      if (left <= 0) {
        status.textContent = "Justo se ha completado esa clase. Elige otro horario.";
        status.className = "form-status is-error";
        render();
        return;
      }

      bookings[cls.id] = (bookings[cls.id] || 0) + 1;
      writeBookings(bookings);

      status.textContent = "¡Reserva realizada! " + cls.name + ", " + cls.day + " a las " + cls.time + ".";
      status.className = "form-status is-success";
      bookingForm.reset();
      render();
    });

    /* Si la página queda abierta al pasar a una semana nueva, se refresca sola */
    var shownWeek = currentWeekKey();
    setInterval(function () {
      if (currentWeekKey() !== shownWeek) {
        shownWeek = currentWeekKey();
        render();
      }
    }, 60000);

    render();
  }

  /* Validación y envío del formulario de contacto */
  var form = document.querySelector("#contact-form");
  if (form) {
    var status = form.querySelector(".form-status");

    function setError(field, message) {
      var wrap = field.closest(".field");
      wrap.classList.add("has-error");
      wrap.querySelector(".field-error").textContent = message;
    }
    function clearError(field) {
      var wrap = field.closest(".field");
      wrap.classList.remove("has-error");
    }

    function validate() {
      var valid = true;
      var name = form.querySelector("#name");
      var email = form.querySelector("#email");
      var interest = form.querySelector("#interest");
      var message = form.querySelector("#message");
      var consent = form.querySelector("#consent");

      [name, email, phone, interest, message].forEach(clearError);

      if (!name.value.trim()) { setError(name, "Indica tu nombre."); valid = false; }

      var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email.value.trim() || !emailPattern.test(email.value.trim())) {
        setError(email, "Introduce un email válido.");
        valid = false;
      }

      if (!interest.value) {
        setError(interest, "Selecciona una opción.");
        valid = false;
      }

      if (!message.value.trim() || message.value.trim().length < 10) {
        setError(message, "Cuéntanos brevemente qué necesitas (mínimo 10 caracteres).");
        valid = false;
      }

      if (consent && !consent.checked) {
        valid = false;
        status.textContent = "Debes aceptar la política de privacidad para continuar.";
        status.className = "form-status is-error";
      }

      return valid;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validate()) {
        if (!status.textContent) {
          status.textContent = "Revisa los campos marcados en rojo.";
        }
        status.className = "form-status is-error";
        return;
      }

      /* Sitio de demostración */
      status.textContent =
        "¡Gracias! Hemos recibido tu mensaje y te contactaremos en menos de 24 h.";
      status.className = "form-status is-success";
      form.reset();
    });
  }
})();