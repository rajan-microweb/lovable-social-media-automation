# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/a21544dd-17bc-4693-ba54-136d20031325

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/a21544dd-17bc-4693-ba54-136d20031325) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/a21544dd-17bc-4693-ba54-136d20031325) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Local Development

### Prerequisites

- Node.js and npm installed

### Environment Variables

This app expects Supabase env vars to be available to Vite at build time.

Create a `.env` file in the project root with:

```bash
VITE_SUPABASE_URL="your_supabase_project_url"
VITE_SUPABASE_PUBLISHABLE_KEY="your_supabase_publishable_anon_key"
```

Optional:

```bash
PORT=2003
```

### Commands

- Install dependencies: `npm i`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Run tests: `npm test`
- Build bundle report: `npm run analyze`

## Project Architecture

See `docs/architecture.md` for:

- route structure (`src/App.tsx`, `src/components/ProtectedRoute.tsx`)
- Supabase data access layer (`src/lib/api/*`)
- shared domain types (`src/types/*`)
- filtering/sorting helpers (`src/lib/posts/*`)
