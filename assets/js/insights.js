      const insightLinks = Array.from(document.querySelectorAll("#insights .toc-link"));
      const insightSections = insightLinks
        .map((link) => document.querySelector(link.getAttribute("href")))
        .filter(Boolean);

      const insightObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const id = `#${entry.target.id}`;
            insightLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === id));
          });
        },
        { rootMargin: "-45% 0px -45% 0px", threshold: 0.01 },
      );

      insightSections.forEach((section) => insightObserver.observe(section));
      if (insightLinks[0]) insightLinks[0].classList.add("active");
