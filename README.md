# BioTrack Pro - Configuration Supabase

Pour faire fonctionner l'application avec votre propre base de données Supabase, suivez ces étapes :

## 1. Création des Tables

Exécutez le script SQL suivant dans l'éditeur SQL de votre tableau de bord Supabase :

```sql
-- Table des mesures environnementales
CREATE TABLE measurements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  zone TEXT NOT NULL CHECK (zone IN ('C', 'D')),
  type TEXT NOT NULL CHECK (type IN ('Actif', 'Passif', 'Surface')),
  point TEXT NOT NULL,
  value FLOAT8 NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('C', 'Alerte', 'NCF')),
  created_by UUID REFERENCES auth.users(id)
);

-- Activation de RLS (Row Level Security)
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;

-- Politiques de sécurité
-- Lecture : Tous les utilisateurs authentifiés peuvent lire
CREATE POLICY "Users can view all measurements" 
ON measurements FOR SELECT 
TO authenticated 
USING (true);

-- Insertion : Les utilisateurs authentifiés peuvent insérer
CREATE POLICY "Users can insert their own measurements" 
ON measurements FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = created_by);

-- Suppression/Modification : Seuls les admins (via metadata) ou le créateur
-- Note : Pour une gestion plus fine des rôles, une table 'profiles' est recommandée.
CREATE POLICY "Admins can update/delete everything" 
ON measurements FOR ALL 
TO authenticated 
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' 
  OR auth.uid() = created_by
);
```

## 2. Variables d'Environnement

Créez un fichier `.env` (ou configurez les secrets sur Cloudflare/GitHub) avec :

```env
VITE_SUPABASE_URL=votre_url_supabase
VITE_SUPABASE_ANON_KEY=votre_cle_anon_supabase
```

## 3. Déploiement

### Sur votre PC (Local)
1. Installez Node.js.
2. Clonez le dépôt.
3. `npm install`
4. `npm run dev`

### Sur Cloudflare Pages
1. Connectez votre dépôt GitHub à Cloudflare Pages.
2. Commande de build : `npm run build`
3. Répertoire de sortie : `dist`
4. Ajoutez les variables d'environnement dans les paramètres Cloudflare.
