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

/* ── 订阅表单 ── */
function subscribeForm(form) {
  var email = form.querySelector('input[type=email]').value.trim();
  if (!email) return;
  form.innerHTML = '<div style="text-align:center;padding:14px;color:#FBBF24">发送中...</div>';
  fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email }),
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.ok) {
        form.innerHTML = '<div style="text-align:center;padding:14px;color:var(--up);font-weight:600">✓ 订阅成功！<br><span style="font-size:.7rem;font-weight:400;color:var(--text-muted)">每周日发送到 ' + email + '</span></div>';
      } else {
        form.innerHTML = '<div style="text-align:center;padding:14px;color:var(--down)">订阅失败，请重试</div>';
        setTimeout(function () { window.location.reload(); }, 2000);
      }
    })
    .catch(function () {
      form.innerHTML = '<div style="text-align:center;padding:14px;color:var(--down)">发送失败，请直接联系微信 twzd2519 订阅</div>';
    });
}
