`login-web-12.2.chunk.fixture` is the unmodified official Jellyfin Web 12.2 login bundle,
commit `61b1f890365ad15138e943e694af723c1d47df2a`. It is licensed under GPL-2.0
(see `web-compat/LICENSE`) and is used to verify the pinned compatibility patch,
restoration and refusal to overwrite unrelated edits. The fixture is not MIT-licensed.

Complete corresponding Web sources, with the separately reviewed compatibility correction, are supplied in `web-compat/jellyfin-web-12.2-compat-source.zip`; remove `quick-connect.patch` to recover the original login call-site used by this fixture.

`main-web-12.2.bundle.fixture` is the unmodified official Web main bundle from the same commit, under GPL-2.0. It tests pinned navigation patching and exact restoration. The complete source archive includes both reviewed changes; their separate patches allow recovering the original call-sites.
