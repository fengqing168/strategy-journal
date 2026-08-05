/* ── 策略研究日志 · 动态增强 ── */

(function () {
  'use strict';

  /* ── 导航高亮当前页 ── */
  var currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  var navLinks = document.querySelectorAll('.site-nav a');
  navLinks.forEach(function (link) {
    var href = link.getAttribute('href');
    if (href === currentPath || (currentPath !== '/' && href !== '/' && currentPath.startsWith(href.replace(/\/$/, '')))) {
      link.classList.add('active');
    }
  });

  /* ── 回到顶部按钮 ── */
  var btn = document.createElement('button');
  btn.className = 'back-to-top';
  btn.setAttribute('aria-label', '回到顶部');
  btn.innerHTML = '&#9650;';
  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.body.appendChild(btn);

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      requestAnimationFrame(function () {
        if (window.scrollY > 400) {
          btn.classList.add('visible');
        } else {
          btn.classList.remove('visible');
        }
        ticking = false;
      });
      ticking = true;
    }
  });

  /* ── 平滑打开外部链接（订阅表单等不拦截） ── */
  document.querySelectorAll('a[href^="http"]').forEach(function (link) {
    link.setAttribute('rel', 'noopener noreferrer');
  });

})();
