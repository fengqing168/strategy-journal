/* ── 动态增强 ── */
(function () {
  'use strict';

  /* 导航高亮 */
  var path = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav a').forEach(function (a) {
    var h = a.getAttribute('href');
    if (h === path || (path !== '/' && h !== '/' && path.startsWith(h.replace(/\/$/, '')))) a.classList.add('active');
  });

  /* 回到顶部 */
  var topBtn = document.createElement('button');
  topBtn.className = 'back-top';
  topBtn.setAttribute('aria-label', 'top');
  topBtn.textContent = '↑';
  topBtn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  document.body.appendChild(topBtn);
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) { requestAnimationFrame(function () { topBtn.classList.toggle('show', window.scrollY > 400); ticking = false; }); ticking = true; }
  });

  /* 滚动渐显 */
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.15 });
  document.querySelectorAll('.fade-in').forEach(function (el) { observer.observe(el); });

})();
