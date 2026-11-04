# Parches Jellyfin Web

Cada aplicador acepta únicamente los bytes originales y parcheados de su manifiesto. Guarda el original y admite `status`, `apply --dry-run`, `apply` y `revert`.

| Perfil | Parche | Aplicador |
|---|---|---|
| 10.10.6 | Detección de scrollOptions | `scripts/fix-scroll-options.mjs` |
| 10.10.6 | Cancelar una ficha durante la navegación | `scripts/fix-navigation-10.10.6.mjs` |
| 10.10.6 | Cierre de Quick Connect | `scripts/fix-quick-connect-10.10.6.mjs` |
| 12.2 | Navegación y Quick Connect del perfil histórico | `scripts/fix-navigation.mjs` y `scripts/fix-quick-connect.mjs` |

En 10.10.6 aplica scrollOptions antes de navegación. Revierte navegación antes de scrollOptions. Quick Connect modifica un archivo separado.

```sh
node scripts/fix-scroll-options.mjs apply --root "YOUR_WEBROOT" --dry-run
```

Las fuentes Web 10.10.6 se fijan a `c335a3024e436fb347078d4f657ba647647676e6`. Para reconstruir el ZIP de fuentes a partir del archivo oficial, usa `python3 scripts/package-web-compat-10.10.6.py YOUR_UPSTREAM_ZIP`. El generador verifica el SHA-256 del archivo antes de aplicar los parches. Las fuentes Web 12.2 se fijan a `61b1f890365ad15138e943e694af723c1d47df2a`. [Upstream 10.10.6](https://github.com/jellyfin/jellyfin-web/tree/c335a3024e436fb347078d4f657ba647647676e6) · [Upstream 12.2](https://github.com/jellyfin/jellyfin-web/tree/61b1f890365ad15138e943e694af723c1d47df2a) · [GPL-2.0](LICENSE)
