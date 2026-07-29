---
layout: default
permalink: /cv/
title: CV
nav: true
nav_order: 5
cv_pdf: /assets/pdf/WenkaiLi_CV.pdf
---

<div class="post cv-pdf-page">
  <article>
    <object
      class="cv-pdf-viewer"
      data="{{ page.cv_pdf | relative_url }}"
      type="application/pdf"
      aria-label="Wenkai Li CV PDF"
    >
      <p>
        <a href="{{ page.cv_pdf | relative_url }}" target="_blank" rel="noopener noreferrer">Open CV PDF</a>
      </p>
    </object>
  </article>
</div>

<style>
  .cv-pdf-page {
    width: 100%;
  }

  .cv-pdf-page article {
    margin-top: 2rem;
  }

  .cv-pdf-viewer {
    width: 100%;
    min-height: calc(100vh - 11rem);
    border: 1px solid var(--global-divider-color);
    border-radius: 0.25rem;
    background: var(--global-card-bg-color);
  }

  @media (max-width: 576px) {
    .cv-pdf-viewer {
      min-height: 75vh;
    }
  }
</style>
