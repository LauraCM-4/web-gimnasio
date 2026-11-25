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

  /* Reserva de plazas (aforo máx. 16 por clase, compartido entre todos los dispositivos) */
  var bookingGrid = document.querySelector("#reserva-grid");
  var bookingForm = document.querySelector("#reserva-form");

  function initBookings() {
    var CAPACITY = 16;
    var MAX_NAME = 40;
    var select = bookingForm.querySelector("#class-select");
    var formStatus = bookingForm.querySelector(".form-status");

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

    firebase.initializeApp(firebaseConfig);
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

    /* Fecha del lunes de la semana actual: así las plazas se reinician cada lunes 
    function weekKey() {
      var d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    }*/
   
        /* Fecha del sábado más reciente: las plazas se reinician cada sábado a las 00:00 */
    function weekKey() {
      var d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); // sábado = 0 días de diferencia
      return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    }

    /* Normaliza lo que llega de la base de datos: solo entradas válidas con nombre */
    function toList(v) {
      if (!v) return [];
      var arr = Array.isArray(v) ? v : Object.keys(v).map(function (k) { return v[k]; });
      return arr.filter(function (b) { return b && typeof b.nombre === "string"; });
    }

    var currentData = {};
    var weekRef = null;
    var shownWeek = null;

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
        var nombres = toList(currentData[cls.id]).map(function (b) { return b.nombre; });
        var left = Math.max(0, CAPACITY - nombres.length);
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

        /* Los nombres (escritos por usuarios) se añaden SIEMPRE como texto, nunca como HTML 
        if (nombres.length) {
          var ul = document.createElement("ul");
          ul.style.cssText = "list-style:none; padding:0; margin:1em 0 0; font-size:.85rem; color:var(--patina-300);";
          nombres.forEach(function (n) {
            var li = document.createElement("li");
            li.textContent = "• " + n;
            ul.appendChild(li);
          });
          card.appendChild(ul);
        }*/

        bookingGrid.appendChild(card);
      });

      /* Repoblar el desplegable del formulario */
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
        var arr = toList(lista).map(function (b) { return { nombre: b.nombre.slice(0, MAX_NAME) }; });
        if (arr.length >= CAPACITY) return; // aborta: la clase se completó justo antes
        arr.push({ nombre: nombre });
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
