# Emlak Komisyon Uygulaması (Estate Commission App)

> Diller: [English](./README.md) · **Türkçe**

Sözleşme → Kapora → Tapu → Tamamlandı süreçlerinden oluşan gayrimenkul işlemlerini takip etmek ve işlem başarıyla sonuçlandığında elde edilen brüt komisyonun emlak acentesi ile süreci yürüten danışmanlar arasında nasıl paylaştırılacağını otomatik olarak hesaplamak için geliştirilmiş, tam yığın (full-stack) bir web uygulamasıdır.

Proje, birbirlerinden bağımsız olarak çalıştırılabilen iki paketi içeren bir monorepo (tek bir depo) şeklinde tasarlanmıştır:

- **`backend/`** — NestJS 11 + Mongoose + MongoDB Atlas geliştirme ekosistemi. Özellikleri arasında JWT kimlik doğrulama, role dayalı erişim kontrolü (RBAC), PDF dışa aktarma, Swagger API dokümantasyonu, sağlık denetimleri (health checks) ve hız sınırlaması (rate limiting) bulunmaktadır.
- **`frontend/`** — Nuxt 3 ile Vue 3 Composition API altyapısı. Uygulamanın içerisinde durum yönetimi için Pinia, stil işlemleri için Tailwind CSS, tiplendirilmiş (type-safe) API istemcisi, gelişmiş aranabilir seçim kutuları (searchable select) ve performansı koruyan gecikmeli arama (debounced search) yapısı yer almaktadır.

Sistemin arkasında yatan mimari kararları, tercihleri ve detaylı kurgusunu incelemek için [`DESIGN.tr.md`](./DESIGN.tr.md) belgesine göz atabilirsiniz.

---

## İçindekiler

1. [Teknoloji Yığını](#teknoloji-yığını)
2. [Depo Düzeni](#depo-düzeni)
3. [Gereksinimler](#gereksinimler)
4. [Hızlı Başlangıç](#hızlı-başlangıç)
5. [Ortam Değişkenleri](#ortam-değişkenleri)
6. [Varsayılan Kullanıcıları Oluşturma (Seeding)](#varsayılan-kullanıcıları-oluşturma-seeding)
7. [Uygulamaları Çalıştırma](#uygulamaları-çalıştırma)
8. [Testler](#testler)
9. [API Özeti](#apı-özeti)
10. [Özellikler Turu](#özellikler-turu)
11. [Derleme ve Dağıtım (Build & Deployment)](#derleme-ve-dağıtım-build--deployment)
12. [Sorun Giderme](#sorun-giderme)
13. [Komut (Script) Referansı](#komut-script-referansı)

---

## Teknoloji Yığını

| Katman | Tercih |
| --- | --- |
| Backend çalışma ortamı | Node.js 20+ / NestJS 11 |
| Veritabanı | MongoDB Atlas (Mongoose 9 aracılığıyla erişilir) |
| Kimlik Doğrulama | JWT (`@nestjs/jwt` + `passport-jwt`) ve bcrypt şifre şifreleme algoritması |
| Veri Doğrulama (Validation) | `class-validator` + `class-transformer` ve projeye yayılan genel `ValidationPipe` |
| API Dokümantasyon | `/docs` rotasında yayınlanan Swagger UI (`@nestjs/swagger`) |
| Uygulama Güvenliği | `helmet`, `@nestjs/throttler` ve ortam değişkeni kontrollü CORS yapısı |
| PDF Rapor Üretimi | `pdfkit` + (Türkçe karakterleri hatasız derlemesi için) DejaVu yazı tipleri |
| Sistem Sağlık Denetimi | `@nestjs/terminus` ve `/health` adresi üzerinden MongoDB anlık ping kontrolü |
| Frontend Altyapısı | Nuxt 3 (Vue 3, Vite, Nitro tabanlı sunucu) |
| Durum Yönetimi (State) | Pinia (Kimlik doğrulama, kullanıcılar ve işlem süreci verilerini saklayan yapılar) |
| Arayüz Tasarımı (CSS) | Tailwind CSS ve özel olarak yazılmış `SearchableSelect` bileşeni |
| Test Süreçleri | Jest (Backend birim testleri ve uçtan uca (e2e) süreçler), `vue-tsc` / `tsc` tip denetimleri |
| Geliştirici Araçları | ESLint + Prettier (Backend), `concurrently` (Aynı terminalde iki sunucuyu çalıştırma aracı) |

---

## Depo Düzeni

```text
estate-comission-app/
├── backend/                  # NestJS API katmanı
│   ├── src/
│   │   ├── auth/             # JWT stratejisi, erişim korumaları (guards), oturum açma (login/me) denetleyicileri
│   │   ├── users/            # Kullanıcı veritabanı şeması ve role dayalı (RBAC) CRUD işlemleri
│   │   ├── transactions/     # Ana sistem (domain): Şemalar, DTO'lar, servis mantığı ve denetleyiciler
│   │   │   ├── utils/        # Komisyon hesaplama mantığı, işlem geçiş adımları, PDF üretim formülleri
│   │   │   └── schemas/      # Mongoose MongoDB şemaları (İşlem kurguları, aşama geçmişi süreci...)
│   │   ├── app.controller.ts # `/health` sağlığı kontrol eden uç nokta modülü
│   │   ├── app.module.ts     # Throttler, Mongoose modüllerinin sisteme bağlandığı ana merkez
│   │   └── main.ts           # Helmet, CORS ayarlamaları, Swagger sunucusu, ValidationPipe merkezi
│   ├── scripts/
│   │   ├── seed.ts           # Sisteme bir yönetici (admin) ve deneme amaçlı birkaç danışman ekler
│   │   └── promote-admin.ts  # Halihazırda var olan standart bir profili admin yetkilerine yükseltir
│   ├── src/assets/fonts/     # PDF'ye gömülü şekilde eklenecek DejaVu TTF (Türkçe destekli) yazı fontları
│   └── test/                 # NestJS uçtan uca (e2e) test senaryoları
├── frontend/                 # Nuxt 3 tabanlı İstemci katmanı (Client)
│   ├── pages/                # login, sistem paneli (index), /transactions/[id], yeni işlem yaratma kısımları
│   ├── components/           # SearchableSelect.vue (Arama yapılabilen dinamik açılır menüler)
│   ├── stores/               # Pinia depoları (auth, kullanıcı verileri ve işlemler)
│   ├── composables/useApi.ts # Kimlik yetki kontrolü yapan ve 401 hatalarını anında yöneten $fetch arayüzü
│   ├── middleware/           # (auth.global) İstemci tarafında her rotada çalışan güvenlik ve rol kalkanı
│   ├── plugins/              # Uygulama yenilendiğinde JWT bilgisini alıp Pinia'ya otomatik entegre eden eklenti
│   ├── utils/                # Token/jwt süreçleri, aşama terimleri ve standartlaşmış hata çözümleme (error) araçları
│   └── types/                # Frontend ortamındaki kullanılan arayüzler ve Tipler (DTO'lar)
├── DESIGN.tr.md              # Mimari kararları ve gerekçeleri anlatan teknik veri dosyası
├── README.tr.md              # Şu anda okuduğunuz başlangıç rehberi belgesi
└── package.json              # Alt klasörleri eş zamanlı koordine eden `concurrently` süreç dosyası
```

---

## Gereksinimler

- Uygulama ortamı için **Node.js 20 LTS** (veya üzeri) ve **npm 10+** yüklü olmalıdır.
- Veri yönetimi için yerel bir MongoDB 6+ makinesi ya da ücretsiz M0 barındırma sağlayan **MongoDB Atlas** kümesi olmalıdır (Sistem doğrudan `mongodb+srv://…` ya da `mongodb://…` standart bağlantı dizesi ile çalışmaktadır).
- Repoyu doğrudan çekebilmek için Git komut satırı aracına (opsiyoneldir) ihtiyacınız bulunmaktadır.

Mevcut sürümünüzü teyit etmek için ilgili komutları terminalinize girin:

```bash
node -v      # v20.x.x veya daha yeni
npm -v       # 10.x.x veya daha yeni
```

---

## Hızlı Başlangıç

Eğer depoyu yeni indirdiyseniz veya klonladıysanız, projeyi ayağa kaldırmanın en kısa yolu şudur:

```bash
# 1. Proje ana dizininde çalışarak hem backend hem de frontend içerisindeki Node modüllerini yükleyin
npm run install:all

# 2. Backend yapılandırmasını kopyalayın. Sonrasında .env dosyasına giderek MONGODB_URI + JWT_SECRET alanlarını mutlaka doldurun.
cp backend/.env.example backend/.env
$EDITOR backend/.env

# 3. (İsteğe bağlı ancak tavsiye edilir) Frontend tarafı için .env dosyası oluşturun
cp frontend/.env.example frontend/.env

# 4. Veritabanına kolay erişebilmeniz adına sistemde bir yönetici ile birlikte birkaç danışman profili yaratın
npm run seed

# 5. Aynı pencere üzerinden Backend (3001. portta) ve Frontend'i (3000. portta) eş zamanlı olarak başlatın
npm run dev
```

Tarayıcınızda [http://localhost:3000](http://localhost:3000) adresine gidin. Başlatma kodu esnasında terminalde konsola yazdırılan varsayılan admin bilgileri (genellikle admin@firma.com / admin123 şeklindedir) ile ilk girişinizi yapın.

---

## Ortam Değişkenleri

### Backend Tarafı (`backend/.env`)

| Değişken | Gerekli mi? | Varsayılan | Amacı ve İşlevi |
| --- | --- | --- | --- |
| `MONGODB_URI` | evet | — | Veritabanına bağlanan yapı `MongooseModule` için oluşturulmuş adres satırıdır. |
| `PORT` | hayır | `3001` | NestJS sunucusunun kendi içinde iletişim kurmak için kullanacağı HTTP kanalıdır. |
| `JWT_SECRET` | evet | — | Tüm JWT imgeleme/doğrulamalarında asıl yetki şifresi. **Gerçek yayına geçmeden kesinlikle değiştirilmiş olmalıdır.** |
| `JWT_EXPIRES_IN` | hayır | `1d` | Yetki kodununun geçersizleşeceği ömür boyutu limitidir (örneğin `1h`, `7d`). |
| `CORS_ORIGIN` | hayır | `http://localhost:3000` | Güvenlik açısından yetki onayı verilen tarayıcı tabanlı virgülle ayrılan dış bağlantı rotaları. |
| `THROTTLE_TTL_MS` | hayır | `60000` | Rate limite sebep veren `@nestjs/throttler`'in kullandığı birimsiz pencere aralığıdır. |
| `THROTTLE_LIMIT` | hayır | `100` | Gelen isteklerde (IP başına) tanımlanmış eşik kotası aralığıdır. |
| `SEED_ADMIN_EMAIL` | hayır | `admin@firma.com` | `npm run seed` oluşturduğunda kurulacak ilk varsayılan admin hesabıdır. |
| `SEED_ADMIN_PASSWORD` | hayır | `admin123` | `npm run seed` oluşturduğunda kullanılacak olan yönetici güvenlik anahtarıdır. |
| `SEED_ADMIN_NAME` | hayır | `Admin User` | Varsayılan yöneticinin uygulamada sergilenen ismidir. |

Herhangi bir eksiklik için güncel hali olan yapıları `backend/.env.example` isimli belgede bulabilirsiniz.

### Frontend Tarafı (`frontend/.env`)

| Değişken | Gerekli mi? | Varsayılan | Amacı ve İşlevi |
| --- | --- | --- | --- |
| `NUXT_PUBLIC_API_BASE` | hayır | `http://localhost:3001` | Frontend panosundaki istemcilerin doğrudan muhattap olduğu ana sunucu uç yetki rotasıdır. |

Tasarım gereği `.env` değişkenlerinin içerisindeki ayar, `runtimeConfig.public.apiBase` yapılandırmasını varsayılanında test amaçlı `http://localhost:3001` değerine bağlar. Bu belge yalnızca test dışında (örn. üretim veya hazırlama sunucusunda farklı adreste iseniz) düzenlenmeyi şart kılar.

---

## Varsayılan Kullanıcıları Oluşturma (Seeding)

Baştan yükleme komutu tekrarlanabilir ve bağımsız (idempotent) çalışır; yani tabloda mevcut olanları kopyalamaz, pas geçerek yenilerini ekler. Düşünmeden bu komutu çalıştırabilirsiniz:

```bash
npm run seed
```

Varsayılan kurucu eklentisi (Siz yukarıdaki .env ile kurarsanız ilgili listeye sizin ayarınız geçerlidir):

| Yetki (Role) | Sisteme Giriş Maili (E-mail) | Şifre |
| --- | --- | --- |
| admin (Yönetici) | `admin@firma.com` | `admin123` |
| consultant (Danışman)| `ayse@firma.com` | `agent123` |
| consultant (Danışman)| `mehmet@firma.com` | `agent123` |
| consultant (Danışman)| `zeynep@firma.com` | `agent123` |

> **Terminoloji notu:** Mimari yapı, kod satırları ve İngilizce emlak terimlerinde bahsi geçen `UserRole.AGENT` (değer: `'agent'`) rolü; Türkiye gayrimenkul kuralları ve dokümantasyonları çerçevesince "Danışman" sıfatıyla kullanılmıştır.

Geçmiş profilin üzerine toptan müdahale yapmak yahut da eldeki hesaplardan birisine yönetici (admin) atamak istiyorsanız:

```bash
npm --prefix backend run promote-admin -- istenilengonderici@adres.com
```

---

## Uygulamaları Çalıştırma

### 1 Seçenek — Tek Terminal (Önerilen)

```bash
npm run dev
```

Bütün süreci tek başlık üzerinden götüren `concurrently` yapısı arka planda `backend/npm run start:dev` ve `frontend/npm run dev` komutlarını aynı anda açar ve size çıktılarında ayırmanızı sağlamak için renklendirir.

### 2 Seçenek — Çiftli Terminaller (Ayrı Ayı Cihazlar veya Sekmeler)

```bash
# Birinci Bölümdeki Başlatıcı (Terminal 1)
npm run dev:backend        # NestJS bu eylem sonucu http://localhost:3001 ortamında çalışacaktır

# İkinci Bölümdeki Başlatıcı (Terminal 2)
npm run dev:frontend       # Nuxt bu eylem sonucu http://localhost:3000 ortamında çalışacaktır
```

### Backend uygulamasının devrede olduğunu teyit etme

```bash
curl http://localhost:3001/health
# → Yansıma: { "status": "ok", "info": { "mongodb": { "status": "up" } }, ... }
```

Görüntüleme dökümanı ve etkileşim sistemi [http://localhost:3001/docs](http://localhost:3001/docs) menüsündedir. Yaptığınız talepler için sağ üstteki **Authorize** kısmına tıklayarak girdiğiniz `POST /auth/login` kodundan gelen token değerini ileterek denemeler yapabilirsiniz.

---

## Testler

```bash
# Sistemdeki Backend unit (birim testleri) - komisyon payı vs gibi karmaşık operasyon testleri ile 36 adet varyasyon değerlendirmesi içerir:
npm test

# Çalışan test sonrasında rapor dökümü analizi (backend/coverage/ hedefinde klasöre kaydedilir):
npm run test:cov

# Genel sistem omurgasına yönelik olan uçtan uca çalıştırıcı (Sistem Mongo URI adresinizi girmiş varsaymaktadır):
npm --prefix backend run test:e2e

# Geliştiricinin arayüz dosyalarında hatalı referanslar arayan frontend komut doğrulama süreci:
npm --prefix frontend exec vue-tsc -- --noEmit

# Sunucu taraflı kodları hizalayan format ayarlayıcısı:
npm run lint
```

Sürekli Entagrasyon (CI) boru hatlarında yürütülmesi için uygun format:

```bash
npm test && npm run lint
```

---

## API Özeti

Sunucudaki (`3001`) yolları altındaki bütün ağ modülleri yetki ile çalışır. Dışarıdan gelecek erişime yalnızca `POST /auth/login` hesaba giriş adresi ve `/health` serbest bırakılmıştır; diğer her alan `Authorization: Bearer <jwt>` onayı olmadan kabul görmemektedir.

| İşlem Tipi | İstek Uç Noktası (Path) | Erişim Rolleri | Görev İfadesi |
| --- | --- | --- | --- |
| POST | `/auth/login` | herhangi biri | JWT verisi sağlayan `{ accessToken, user }` dönüşü; dakikada (10) limitle korunan rotadır. |
| GET | `/auth/me` | tüm giriş yapanlar | Sistemin kullanıcı değerini sağladığı onay alanı (`{ userId, email, role }`). |
| POST | `/users` | admin | Sunucuya yeni danışman ya da yönetici seviyesinde bir ekip üyesi aktarma görevi alır. |
| GET | `/users` | admin, consultant | Özellikle işlemler esnasındaki danışman menülerinde kişilerin yetkileri liste halinde görüntülenir. |
| GET | `/transactions` | admin, consultant | Verilerin çok fonksiyonlu kombin halinde filtrelenebileceği gelişmiş çağrı alanıdır; `search`, `stage` limit gibi her opsiyona çalışır. |
| POST | `/transactions` | admin, consultant | Danışman arkadaşın (yetkilinin) `listingAgent` (kayıtı alan taraf) veya `sellingAgent` (satıcı taraf) ibarelerinden herhangi birini dâhil ettiği oluşturma işlemini kapsar. |
| GET | `/transactions/:id` | admin, consultant | Sadece kişilerin hak ve izinli olduğu kendi yetkili oldukları görüntülenir. |
| PATCH | `/transactions/:id/stage`| admin, consultant | Mevcut aşamayı lakin ancak kural hatasız ve tek yönde aktarmaların güncellemeleridir; çakışmaya 409 atar. |
| GET | `/transactions/:id/export`| admin, consultant | Aşama, döküm raporları ile finans durumunun özetlendiği şık basım formatlı sistem dosyasını çıkartır. |
| GET | `/health` | herkese açık | Sağlık test rotalarımızı anında Mongo db döküm durumları eşliğiyle yollar. |
| GET | `/docs` | herkese açık | Yapılan işlemleri geliştiriciler için şema listesinde barındıran okuma adresimiz. |

### Örnek Kurulum İşlemi (Bağlantı Girişi + Listeleme Talebi)

```bash
TOKEN=$(curl -s http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@firma.com","password":"admin123"}' | jq -r .accessToken)

curl -s http://localhost:3001/transactions \
  -H "Authorization: Bearer $TOKEN" | jq '.total, .data[0]'
```

### Detaylı ve Gelişmiş API Filtreleme Sistem Özellikleri

Listeleme adresi olan `GET /transactions` işlemi aşağıdakilerin hepsinin mükemmel karmalarını üreterek değer bulabilmektedir:

| Hedef Parametre | Tip Durumu | Etki Kapsamı |
| --- | --- | --- |
| `page` | int ≥1 | Yönlenilmek istenen sayfa sekmesi (Varsayılan referans: 1). |
| `limit` | int 1-100| Sayfa içeriğindeki işlem rakamsal limiti (Varsayılan alan: 10). |
| `search` | string | Metin satırı referans alınarak büyük/küçük (case-insensitive) regex kurgularında aratma. |
| `stage` | enum | Durum alanları filtreleri `agreement`, `earnest_money`, `title_deed`, `completed`. |
| `minTotalFee` | number ≥0| Beklenen kazanımın (`totalFee`) alt limit/en dip kazanç rakam verisi durumu. |
| `maxTotalFee` | number ≥0| Belirlenen (`totalFee`) tavan kazancı ve kazancınızın aşım limiti değeri filtrelemesi. |
| `startDate` | ISO date | Kaydın başlangıcının tarihsel limiti `createdAt >= startDate`. |
| `endDate` | ISO date | Kaydın arama sürecinde tavan değerin saatlere vurularak oluşturulmuş sistem referans tarihi. |
| `agentId` | ObjectId | **Tamamen yöneticilere ait kontrol modudur**. Süzgeç verilerindeki komisyoncular üzerinden hem satan (`sellingAgent`) ve ilanı bulan (`listingAgent`) rotasında filtre sağlar. |

---

## Özellikler Turu

- **Giriş süreç işleyişleri (Login flow)** — Gelişmiş güvenlik JWT arayüzdeki model olan `lax` isimli çerezde (cookilerde) saklanmaktadır; böylece sistem (Nuxt vb yapılandırmaları ile birlikte) tarayıcının içerisine (Pinia state altyapısına vb yerlere) aktarımları doğrudan ve zahmetsiz şekilde entegre eyler. Rota yönlendiricileri tamamen süresinin `exp` denetimi mantığıyla geçersiz yetkilerden sizleri men eder.
- **Yönetim/Yazılım panosu (Dashboard (`/`))** — 500 ms tepkimenin kullanıldığı oldukça duyarlı "debounce" eklentisine sahiptir, ileri yönü hedefler (satır içi detaylar "View Detail vb komut sistemi" veya aşama yöneten alanların kullanımı), gelişigüzel süzgeçlemeler ("Aşamalar filtreler vb").
- **Taze işlemler form eklentisi (Yeni - `/transactions/new`)** — Çok yüksek potansiyellilerdeki kullanıcı sayıları için üretimiştir (Temsilcilerin vb aramasındaki dinamikleştirilmesi). Form onayları yalnızca işlemi başlatan sistem aktarıcısının "kendi hesabını form kutularının 1 yerinde barındırmasına" onay kılar.
- **İşlemin iç dökümü sayfası (`/transactions/[id]`)** — Gömülü alt dokümanlara bağlı olarak gelişmektedir (`stageHistory` verisi gibi); bu mantık tamamen renk dikey çubuğunda tarihçelere eşlik sunar. Süreç (COMPLETED) kapanışında, her kişinin kendi kazancının şeffaf net dökümü hesap dökümü tablolarında paylaşılır aynı anda pdf dökümü aktarılır hale de geçirilir (`/transactions/:id/export`).
- **Kullanıcının yönetici kısımlarında yetki eklentisi (`/users` ve Yalnızca yöneticiye özgüdür)** — Avatar vb listeleme ayarları ve rollerde/isimlerde yeni kayıt oluşturup mevcut olanların okunaklı düzenli ekranda yayınlanmalarını sunması.
- **Rapor ve format yapısı PDF ihracı** — Tamamen projenin kurum ruhuna hitap eyleyen, şirket tasarımı ve markalaşan renk dizininden faydalanmayı barındırarak, sayfa renk kurgusuyla tutarlık ve Türkçe altyapılı (`DejaVu`) PDF aktarımıyla tüm harfleri (`ı / ş / ç / ö / ğ / ü`) kesintisiz çıkartır.
- **Baskılardan eş zaman koruma güvenlik eklentileri (Concurrency safety)** — İki insanın kazara, senkron saniyelerdeki çatışmalı hareketleriyle (aşama güncellemeleri/bozmaları) aynı anda iki defa güncellenmemesi (`findOneAndUpdate` vs) adına her zaman onaylı referans denetlenerek verisi tam yansıtılır hale konmuştur.
- **Kontrol / iz sürücü (Audit)** — Eklenen sistem yapısında `StageHistoryEntry` dökümü iş ve işlemlerin tamamen kim tarafından tetiklenerek (`changedBy`) adım adım onayda/kayıt altında bırakıldığını, denetimi yapmayı netleştirir ve hesap güvenilirliği / sorgusu mekanizmalarını kuvvetlendirmesinde barınmaktadır.

---

## Derleme & Dağıtım

### Üretim derlemesi oluşturmak (Canlıya aktarma yapıları)

```bash
npm run build
# ├── backend/dist/          (NestJS derlemelerini barındıran eklenti font/varlık havuzu)
# └── frontend/.output/      (Özel NodeJS tabanlı Nitro/frontend paket verileri)

# Sistemdeki node komutuyla ana arkaplanı çalıştırarak hizmete başlatın:
NODE_ENV=production node backend/dist/main.js

# Nuxt (Nitro motoruna vs komutlanmış şekilde) istemci alan barındırma panelinde projenizi açın:
node frontend/.output/server/index.mjs
```

### Bağlayıcılar ve Arka Uç (Backend) ile barındırma süreci

- NodeJS altyapısına doğrudan hazır tasarlanmıştır; AWS, Heroku, Render, ve Digitalocean mantıklarındaki her sisteme direkt oturtulur.
- `.env` kodlarına güvenliği kurgulamak adına projede vs dış platforma atıp commit gönderilmemesi, tüm bu şifrelerinin uygulamanın bulunduğu asıl panel olan ortam alanındaki env yönetimine sızdırılması katı kural olarak barınmalıdır.
- TCP yapısında bir port olan `3001` için açık olmasını/veya (`PORT` ayarlarına işlenmesini) onaydan çıkarın.
- Load-balancer'ları, `/health` ping onay servis verileri komutlarına dayandırın.
- Doğrulama iznini `CORS_ORIGIN` tarafına yazılmasında Frontend alan url dizinlerinizi, birden çoksa hepsini dikişsiz haritalayın.

### Frontend Barındırma ve Yansıtmalara ait ipuçları

- Verilen komut kurgularında standart, bağımsız yapılar olduğu da doğrudur; ancak oluşturulmuş derlemeyi (`frontend/.output/`) doğrudan bir sunucu verisinde Node mantığıyla entegre kullanırsınız.
- Projede API rotanızı (Canlı panel için vs) `NUXT_PUBLIC_API_BASE` tarafı olarak onaylatıp ayarlara çakmalısınız (Rotanın arkasında bölü ("/") ayarı asla vb bulunmamasına referansa değer alarak yön verin).

### Docker/İşletim Kutusu Yapıları (Container kurulumları)

Proje de varsayılan alan modüllerinde Dockerfile kurgulanmadıysa bile en basit Node tabanlı sürdürülebilirliğe `npm run build` ile entegre edilebileceği için (derleme süreci vs) çok hızlı bir (`Dockerfile`) ile ayağa kaldırılması tamamen kusursuz dizilime işaret eder.

---

## Sorun Giderme

**Terminal başlangıcındaki komut sonrası: `MONGODB_URI environment variable is not defined` ibaresi:**
Kurulu sistem diziliminizde `backend/.env` klasörü altında ana adres ayarları boştur/hatalı yazılmıştır. Sistem kökünden tetiklenen işlemler vs süreç komut dizinine girdiğinden kökteki verileri tarar, adından dolayı `.env` belgenizde (ör. MongoDB URL dizesi) aratır ve onay bekler.

**Panel girişi sırasında API uyarısı dönmesi: `429 Too Many Requests` (Çok Uzun Deneme vs/Yetki kısıtlamaları):**
Siber sızıntılardan veya (Parola vb ezilmesinden) korunmak amacıyla `POST /auth/login` kısıtları arayüz için (`10` kota sınırıdır). Sistemin koruyucusundan sıyrılmak için (~60 saniye limitini tamamlamasını) bir dakikalık bir işlem esnesi beklenmelidir.

**Son onay düğmesindeki basma eylemleriniz de (`409 Conflict`) red/çatışması hatası:**
Hemen büyük oranda yan sekmede yahut da işlem yapan meslektaşınızdan dolayı döküman aynı hedefe yöneltildiği gibi iş bitmiş/taşınmıştır. Tekrar tarayıcı sayfanızı F5 üzerinden yenileyip sayfadaki en yeni dokümanın durduğu son yere bakmanızı sağlar, sistem daima son işlem sürecini koruyup ezer geçmesine izin bırakmamaktadır.

**Bir danışmanın sıfır sistem kaydı girmesi veya form oluşturulmasındaki yetki hatası (`403 Forbidden`):**
Her çalışan kişi oluşturulan emlak işinin mutlaka ya işi getiren (`listingAgent` sekmesine) yahut alıcı yönünden satışını yönetene (`sellingAgent` bölümünde) direkt var olması yetkisi tanımlar. Aksi halinde danışmanlar menü formlarına işlem açmak için bir isim dahi seçemeden men edilir (Listeler sadece ona yetki kısıtlananlarınca kontrolle onanır).

**Dosya indirilen belge PDF (Export kurgusu nda) hatalı metin (Karakterlerin `???` diye sorunsuz vs çıkmaması) ile uyuşması :**
Sunucu klasörü dahil veriler (`backend/dist/`) üzerine font dosyasını ttf olan DejaVu uzantılarını entegre aktaramadığı anlamına ulaşmaktadır. Proje test kurulum diziliminizde vs. projedeki ayarları (`backend/nest-cli.json` - assets kod alanı bloklarında vs) okumayı onaylatıp tekrar çalıştırın ("npm run build vs" vs ile) komutlarını işletin.

**404 dönüp sistem Nuxt Base yansıtılması (Frontend'in `http://localhost:3000/transactions/` dizge çekmesinde hata oluştuğu vs vs)**
Projenizde varlığında api dizinine uzanan `NUXT_PUBLIC_API_BASE` sekmenin iç kısımlarının boş ya da adresin arayüz alanında asılı kalıp onay beklediğindendir. Kısaca .env yapı ayarının direkt sunucu rotasını işleyip göstertilmesi (`3001` değerlerinden arındırılıp doğru formüllerine kurgulanması vb) yeterli gelecektir.

**Veri yollarını kitleyen "Adres/Port 3001 üzerinde" `EADDRINUSE` komut tıkanıklıkları atması**
Port tarafı aktif kullanan vs (yan terminalde çalışan arka vs port panelleriniz var demektir). Arka modül sürecini tamamen kesime uğratın:
```bash
lsof -ti:3001 | xargs kill -9
```

---

## Komut (Script) Referansı

Sistemi tepeden (root dizininden) yöneten ve tetikleyen eklenti komutları:

| Uygulanacak Komut | Sistemde Nasıl ve Ne şekilde çalışmaya işler |
| --- | --- |
| `npm run install:all` | En baş sistem `backend/` den de ve `frontend/` paket dosyası olan modülleri aynı an da ana terminal de barındırır. |
| `npm run dev` | Alt modülde olan `concurrently` sayesinde projelerin her yeri (front ile app) paralel bir entegrede yatar, başlar. |
| `npm run dev:backend` | Doğrudan API / Backend için NestJS yi denetleme vs sürecinde başlatmayı ve derlenmeyi (watch) tetikler. |
| `npm run dev:frontend`| Standart arayüz (Nuxt sistem dev komutuyla) yalnız kendini başlatmaya atanır. |
| `npm run build` | Live ve Production seviyesindeki sunucu kodlarına indirgeme / basılma komut yapısını sağlar. |
| `npm test` | Tam tekmil Backend birimi unit test akım kod senaryolarını test dökümüne başlatan süreç (Jest vs ile ektedir). |
| `npm run test:cov` | Kaynak satır sistemimizin ne kadarına denetim işlemi testinin var oluş kapsamasını (`coverage`) derler / okur. |
| `npm run lint` | ESLint de barındırılan kurallaştırma metotların tamamının birleştiği tamir alan komut arayüz yansıtır. |
| `npm run seed` | Örnek hesaplarını tek komutta arıza çıkarmadan (`idempotent`) arayüze oturtacak 4 kullanıcılı komutu verisine gömer. |

Sadece sistemsel arka planda (`backend/` altından vb dizinden) barınan özel terminal işlemlerin referansı :

| Uygulanacak Komut | Sistemde Nasıl ve Ne şekilde çalışmaya işler |
| --- | --- |
| `npm run start:dev` | Varsayılan NestJS (sürüm derleyerek vb süreçlerde takip eder / start durumuna) alır. |
| `npm run start:prod` | Üretime uyumlu çalışabilecek (`dist/main.js` yi) kodlayarak çalıştırılma iznine geçiş komutlarını tetikler. |
| `npm run test:e2e` | Komple sarmallanmış E2E süreçlerine vs sistem deneme ve yanılma Jest ortamları ayağını aktif formüle alır. |
| `npm run seed` | Komut `ts-node` aracılığına tutulup formüller de yer barındıran `scripts/seed.ts` de saklı alanla derlenmesine yardım aracıdır.|
| `npm run promote-admin` | Danışman sınıfının her herhangi olan vb email formulu listesini vs alarak sistem yöneticisine tam yetkili rol ekler onaylı formudur.|

Keyifli kodlamalar!
