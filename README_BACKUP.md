# Procedura backupu bazy JSON

1. Zatrzymaj backend (`Ctrl+C` w terminalu, gdzie działa `json-server`).
2. Wykonaj ręczny snapshot:
   ```bash
   ./scripts/backup-db.sh
   ```
   Plik trafi do katalogu `backups/` z oznaczeniem daty.
3. Opcjonalnie dodaj zadanie cron (np. co godzinę):
   ```bash
   0 * * * * /Users/lukaszbasiaga/Planner_IBCS/scripts/backup-db.sh
   ```
4. Aby przywrócić stan z kopii zapasowej:
   ```bash
   cp backups/db-YYYYMMDD-HHMMSS.json packages/backend/db.json
   ```
5. Uruchom ponownie backend (`npm --workspace packages/backend run dev`).

*Katalog `backups/` jest pomijany przez Git, trzymaj tam prywatne kopie.*
