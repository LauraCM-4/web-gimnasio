/* ΛUREΛ FITNESS — comportamiento del sitio */
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

  /* Reserva y cancelación de plazas (aforo máx. 16 por clase, compartido entre todos los dispositivos) */
  var bookingGrid = document.querySelector("#reserva-grid");
  var bookingForm = document.querySelector("#reserva-form");
  var cancelForm = document.querySelector("#cancelar-form");

  function initBookings() {
    var CAPACITY = 16;
    var MAX_NAME = 40;
    var select = bookingForm.querySelector("#class-select");
    var formStatus = bookingForm.querySelector(".form-status");

    var cancelClassSelect = cancelForm ? cancelForm.querySelector("#cancel-class-select") : null;
    var cancelBookingSelect = cancelForm ? cancelForm.querySelector("#cancel-booking-select") : null;
    var cancelStatus = cancelForm ? cancelForm.querySelector(".form-status") : null;

    if (typeof firebase === "undefined") {
      bookingGrid.textContent = "No se pudo cargar el sistema de reservas. Inténtalo más tarde.";
      return;
    }

    var firebaseConfig = {
      apiKey: "AIzaSyC9bXWofN3gCQ8ITrInnc-lQ5g53d3TiAw",
      authDomain: "aurea-fitness.firebaseapp.com",
      databaseURL: "https://aurea-fitness-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "aurea-fitness"
    };
    if (/PEGA_AQUI/.test(firebaseConfig.databaseURL)) {
      bookingGrid.textContent = "El sistema de reservas aún no está configurado.";
      return;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    var db = firebase.database();

    /* Las clases se leen de la tabla de horarios.html: es el único sitio donde se editan */
    var CLASSES = [];

    function slug(text) {
      return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().slice(0, 3);
    }

    function loadClasses() {
      return fetch("horarios.html", { cache: "no-cache" })
        .then(function (r) {
          if (!r.ok) throw new Error("http " + r.status);
          return r.text();
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, "text/html");
          var table = doc.querySelector(".timetable");
          if (!table) throw new Error("sin tabla");
          var days = Array.prototype.map.call(table.querySelectorAll("thead th"), function (th) {
            return th.textContent.trim();
          }).slice(1);
          var list = [];
          days.forEach(function (day, col) {
            table.querySelectorAll("tbody tr").forEach(function (row) {
              var time = row.querySelector("th").textContent.trim();
              var cell = row.querySelectorAll("td")[col];
              var b = cell && cell.querySelector("b");
              if (!b) return; /* celda vacía */
              var info = (cell.querySelector("span") || {}).textContent || "";
              var parts = info.split("·");
              list.push({
                id: slug(day) + "-" + time.replace(":", ""),
                day: day,
                time: time,
                name: b.textContent.trim(),
                duration: parseInt(parts[0], 10) || "",
                trainer: (parts[1] || "").trim()
              });
            });
          });
          if (!list.length) throw new Error("sin clases");
          CLASSES = list;
        });
    }

    /* Fecha del sábado más reciente: las plazas se reinician cada sábado a las 00:00 */
    function weekKey() {
      var d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
      return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    }

    function makeBookingId() {
      return "r-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
    }

    function normalizeBooking(item, idx) {
      if (!item || typeof item.nombre !== "string") return null;
      var cleanName = item.nombre.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
      if (!cleanName) return null;
      return {
        id: typeof item.id === "string" && item.id ? item.id : ("legacy-" + idx),
        nombre: cleanName
      };
    }

    /* Normaliza lo que llega de la base de datos: solo entradas válidas con nombre */
    function toList(v) {
      if (!v) return [];
      var raw = Array.isArray(v) ? v : Object.keys(v).map(function (k) { return v[k]; });
      var out = [];
      raw.forEach(function (item, idx) {
        var norm = normalizeBooking(item, idx);
        if (norm) out.push(norm);
      });
      return out;
    }

    var currentData = {};
    var weekRef = null;
    var shownWeek = null;

    function setCancelFeedback(message, isError) {
      if (!cancelStatus) return;
      cancelStatus.textContent = message;
      cancelStatus.className = "form-status cancel-status " + (isError ? "is-error" : "is-success");
    }

    function populateCancelBookings(classId, selectedBookingId) {
      if (!cancelBookingSelect) return;
      var prevVal = selectedBookingId || cancelBookingSelect.value;
      cancelBookingSelect.innerHTML = "";

      if (!classId) {
        var defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = "Primero elige una clase…";
        cancelBookingSelect.appendChild(defaultOpt);
        return;
      }

      var reservas = toList(currentData[classId]);
      if (!reservas.length) {
        var emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "No hay reservas en esta clase";
        cancelBookingSelect.appendChild(emptyOpt);
        return;
      }

      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Selecciona la reserva…";
      cancelBookingSelect.appendChild(placeholder);

      reservas.forEach(function (item) {
        var opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = item.nombre;
        cancelBookingSelect.appendChild(opt);
      });

      if (prevVal && reservas.some(function (r) { return r.id === prevVal; })) {
        cancelBookingSelect.value = prevVal;
      }
    }

    function syncCancelSelectors(focusClassId, focusBookingId) {
      if (!cancelClassSelect || !cancelBookingSelect) return;
      var currentClassVal = focusClassId || cancelClassSelect.value;
      cancelClassSelect.innerHTML = '<option value="">Selecciona una clase…</option>';

      CLASSES.forEach(function (cls) {
        var count = toList(currentData[cls.id]).length;
        var opt = document.createElement("option");
        opt.value = cls.id;
        opt.textContent = cls.day + " " + cls.time + " — " + cls.name + " (" + count + " reservada" + (count === 1 ? "" : "s") + ")";
        cancelClassSelect.appendChild(opt);
      });

      if (currentClassVal) {
        cancelClassSelect.value = currentClassVal;
      }
      populateCancelBookings(cancelClassSelect.value, focusBookingId);
    }

    function cancelBooking(cls, bookingId, bookingName) {
      if (!weekRef || !cls || !bookingId) return;
      var confirmed = window.confirm(
        "¿Cancelar la reserva de " + bookingName + " en " + cls.name + " (" + cls.day + " " + cls.time + ")?"
      );
      if (!confirmed) return;

      setCancelFeedback("Cancelando reserva…", false);

      weekRef.child(cls.id).transaction(function (lista) {
        var arr = toList(lista);
        var nextArr = arr.filter(function (b) { return b.id !== bookingId; });
        if (nextArr.length === arr.length) return;
        return nextArr.length ? nextArr : null;
      }, function (error, committed) {
        if (error) {
          setCancelFeedback("No se pudo cancelar la reserva. Comprueba tu conexión.", true);
        } else if (!committed) {
          setCancelFeedback("Esa reserva ya no estaba activa.", true);
        } else {
          setCancelFeedback("Reserva cancelada: " + bookingName + " (" + cls.name + ", " + cls.day + " " + cls.time + ").", false);
          if (cancelForm) cancelForm.reset();
          populateCancelBookings("", "");
        }
      });
    }

    if (cancelClassSelect) {
      cancelClassSelect.addEventListener("change", function () {
        if (cancelStatus) {
          cancelStatus.textContent = "";
          cancelStatus.className = "form-status cancel-status";
        }
        populateCancelBookings(cancelClassSelect.value, "");
      });
    }

    if (cancelForm) {
      cancelForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (cancelStatus) {
          cancelStatus.textContent = "";
          cancelStatus.className = "form-status cancel-status";
        }
        var cls = CLASSES.find(function (c) { return c.id === (cancelClassSelect ? cancelClassSelect.value : ""); });
        if (!cls) {
          setCancelFeedback("Elige la clase de la que quieres cancelar la reserva.", true);
          return;
        }
        var bookingId = cancelBookingSelect ? cancelBookingSelect.value : "";
        var reservas = toList(currentData[cls.id]);
        var target = reservas.find(function (r) { return r.id === bookingId; });
        if (!target) {
          setCancelFeedback("Selecciona la reserva que deseas cancelar.", true);
          return;
        }
        cancelBooking(cls, target.id, target.nombre);
      });
    }

    function listen() {
      var key = weekKey();
      if (key === shownWeek) return;
      if (weekRef) weekRef.off();
      shownWeek = key;
      currentData = {};
      weekRef = db.ref("reservas/" + key);
      weekRef.on("value", function (snapshot) {
        currentData = snapshot.val() || {};
        draw();
      }, function () {
        bookingGrid.textContent = "No se pudo cargar la disponibilidad. Comprueba tu conexión.";
      });
    }

    function draw() {
      bookingGrid.innerHTML = "";
      CLASSES.forEach(function (cls) {
        var reservas = toList(currentData[cls.id]);
        var left = Math.max(0, CAPACITY - reservas.length);
        var full = left === 0;

        var card = document.createElement("article");
        card.className = "service" + (full ? " is-full" : "");
        card.style.borderTopColor = full ? "var(--patina-400)" : "var(--gold-500)";

        var badge = full
          ? '<span style="color:var(--patina-400); font-weight:700;">Completo</span>'
          : '<span style="color:var(--gold-300); font-weight:700;">' + left + ' / ' + CAPACITY + ' plazas libres</span>';

        /* Solo datos fijos de CLASSES van en innerHTML */
        card.innerHTML =
          '<p style="font-family:var(--font-display); font-size:1.1rem; margin-bottom:.1em; color:var(--gold-500);">' + cls.day + ' · ' + cls.time + '</p>' +
          '<h3 style="margin-bottom:.15em;">' + cls.name + '</h3>' +
          '<p style="color:var(--patina-300); margin-bottom:.6em;">' + (cls.duration ? cls.duration + ' min · ' : '') + cls.trainer + '</p>' +
          '<p style="margin-bottom:1em;">' + badge + '</p>' +
          '<button type="button" class="btn ' + (full ? 'btn--outline' : 'btn--primary') + ' btn--block" data-pick="' + cls.id + '"' + (full ? ' disabled' : '') + '>' +
          (full ? 'Completo' : 'Elegir esta clase') +
          '</button>';

        /* Lista de reservas con botón directo para cancelar; nombres añadidos siempre como texto */
        if (reservas.length) {
          var ul = document.createElement("ul");
          ul.style.cssText = "list-style:none; padding:.7em 0 0; margin:1em 0 0; border-top:1px solid var(--teal-600); font-size:.86rem; color:var(--patina-300);";

          reservas.forEach(function (item) {
            var li = document.createElement("li");
            li.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 0;";

            var nameSpan = document.createElement("span");
            nameSpan.textContent = "• " + item.nombre;

            var cancelBtn = document.createElement("button");
            cancelBtn.type = "button";
            cancelBtn.textContent = "Cancelar";
            cancelBtn.style.cssText =
              "background:none; border:1px solid var(--patina-400); color:var(--patina-300); " +
              "border-radius:3px; padding:2px 8px; font-size:.78rem; cursor:pointer; flex-shrink:0;";
            cancelBtn.addEventListener("click", function () {
              cancelBooking(cls, item.id, item.nombre);
            });

            li.appendChild(nameSpan);
            li.appendChild(cancelBtn);
            ul.appendChild(li);
          });

          card.appendChild(ul);
        }

        bookingGrid.appendChild(card);
      });

      /* Repoblar el desplegable del formulario de reserva */
      var currentValue = select.value;
      select.innerHTML = '<option value="">Selecciona una clase…</option>';
      CLASSES.forEach(function (cls) {
        var left = Math.max(0, CAPACITY - toList(currentData[cls.id]).length);
        var opt = document.createElement("option");
        opt.value = cls.id;
        opt.textContent = cls.day + " " + cls.time + " — " + cls.name + (left === 0 ? " (Completo)" : " (" + left + " libres)");
        if (left === 0) opt.disabled = true;
        select.appendChild(opt);
      });
      if (currentValue) select.value = currentValue;

      /* Repoblar los desplegables del formulario de cancelación */
      syncCancelSelectors();

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
      var nameInput = bookingForm.querySelector("#r-name");
      var nombre = nameInput.value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);

      if (!nombre) {
        formStatus.textContent = "Escribe tu nombre para poder reservar.";
        formStatus.className = "form-status is-error";
        nameInput.focus();
        return;
      }
      var cls = CLASSES.find(function (c) { return c.id === select.value; });
      if (!cls) {
        formStatus.textContent = "Elige una clase de la lista.";
        formStatus.className = "form-status is-error";
        return;
      }

      var submitBtn = bookingForm.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      formStatus.textContent = "Enviando…";
      formStatus.className = "form-status is-success";

      weekRef.child(cls.id).transaction(function (lista) {
        var arr = toList(lista).map(function (b) {
          return { id: b.id, nombre: b.nombre.slice(0, MAX_NAME) };
        });
        if (arr.length >= CAPACITY) return; // aborta: la clase se completó justo antes
        arr.push({ id: makeBookingId(), nombre: nombre });
        return arr;
      }, function (error, committed) {
        submitBtn.disabled = false;
        if (error) {
          formStatus.textContent = "No se pudo enviar la reserva. Comprueba tu conexión.";
          formStatus.className = "form-status is-error";
        } else if (!committed) {
          formStatus.textContent = "Justo se ha completado esa clase. Elige otro horario.";
          formStatus.className = "form-status is-error";
        } else {
          formStatus.textContent = "¡Reserva realizada! " + cls.name + ", " + cls.day + " a las " + cls.time + ".";
          formStatus.className = "form-status is-success";
          bookingForm.reset();
        }
      });
    });

    bookingGrid.textContent = "Cargando clases…";
    loadClasses().then(function () {
      listen();
      /* Si la página queda abierta al cambiar de semana, pasa a la nueva sola */
      setInterval(listen, 60000);
    }).catch(function () {
      bookingGrid.textContent = "No se pudo cargar el horario de clases. Si abres la web desde un archivo local, usa un servidor (por ejemplo Live Server) o la web publicada.";
    });
  }

  if (bookingGrid && bookingForm) initBookings();

  /* Validación y envío del formulario de contacto */
  var form = document.querySelector("#contact-form");
  if (form) {
    var status = form.querySelector(".form-status");

    function setError(field, message) {
      var wrap = field.closest(".field");
      if (!wrap) return;
      wrap.classList.add("has-error");
      var out = wrap.querySelector(".field-error");
      if (out) out.textContent = message;
    }
    function clearError(field) {
      var wrap = field.closest(".field");
      if (wrap) wrap.classList.remove("has-error");
    }

    function validate() {
      var valid = true;
      var name = form.querySelector("#name");
      var email = form.querySelector("#email");
      var interest = form.querySelector("#interest");
      var message = form.querySelector("#message");
      var consent = form.querySelector("#consent");

      [name, email, interest, message].forEach(clearError);

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
      status.textContent = "";
      status.className = "form-status";

      /* Campo trampa anti-spam: los humanos no lo ven; si viene relleno, es un bot */
      var trap = form.querySelector('input[name="_gotcha"]');
      if (trap && trap.value) {
        status.textContent = "¡Gracias! Hemos recibido tu mensaje.";
        status.className = "form-status is-success";
        form.reset();
        return;
      }

      if (!validate()) {
        if (!status.textContent) {
          status.textContent = "Revisa los campos marcados en rojo.";
        }
        status.className = "form-status is-error";
        return;
      }

      if (/TU_ID/.test(form.action)) {
        status.textContent = "El formulario aún no está configurado.";
        status.className = "form-status is-error";
        return;
      }

      var submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      status.textContent = "Enviando…";
      status.className = "form-status is-success";

      fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { "Accept": "application/json" }
      })
        .then(function (response) {
          if (response.ok) {
            status.textContent = "¡Gracias! Hemos recibido tu mensaje y te contactaremos en menos de 24 h.";
            status.className = "form-status is-success";
            form.reset();
          } else {
            status.textContent = "No se pudo enviar el mensaje. Inténtalo de nuevo o escríbenos a hola@gymcalera.es.";
            status.className = "form-status is-error";
          }
        })
        .catch(function () {
          status.textContent = "No se pudo enviar el mensaje. Comprueba tu conexión e inténtalo de nuevo.";
          status.className = "form-status is-error";
        })
        .finally(function () {
          submitBtn.disabled = false;
        });
    });
  }
})();
