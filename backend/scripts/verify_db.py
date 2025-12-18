import sqlite3
import os
import argparse
import csv

def run_check():
    # 1. Setup Argument Parser
    parser = argparse.ArgumentParser(description="Verify SQLite Database and optionally export to CSV.")
    parser.add_argument("db_path", help="Path to the .db file")
    parser.add_argument("--export", help="Path to export the result as a CSV file", default=None)
    
    args = parser.parse_args()
    db_path = args.db_path

    # 2. Verify DB exists
    if not os.path.exists(db_path):
        print(f"❌ Error: Database file not found at: {db_path}")
        return

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        print(f"--- 🔍 VERIFYING DATABASE: {db_path} ---")

        # Prepare list to store flattened data for CSV
        csv_rows = []
        csv_headers = ["User ID", "User Name", "Email", "Assignment ID", "Title", "Due Date", "Task ID", "Task Date", "Status", "Description"]

        # [1] GET USERS
        cursor.execute("SELECT id, name, email FROM users")
        users = cursor.fetchall()

        for u in users:
            print(f"\n👤 User ID {u['id']}: {u['name']} ({u['email']})")

            # [2] GET ASSIGNMENTS
            cursor.execute("""
                SELECT id, title, due_date 
                FROM assignments 
                WHERE user_id = ?
                ORDER BY created_at DESC
            """, (u['id'],))
            assignments = cursor.fetchall()

            if not assignments:
                print("   (No assignments found)")

            for a in assignments:
                print(f"   📅 ID {a['id']} | '{a['title']}' (Due: {a['due_date']})")

                # [3] GET TASKS
                cursor.execute("""
                    SELECT id, task_description, scheduled_date, completed 
                    FROM study_tasks 
                    WHERE assignment_id = ? 
                    ORDER BY scheduled_date
                """, (a['id'],))
                tasks = cursor.fetchall()

                for t in tasks:
                    status_icon = "✅" if t['completed'] else "⬜"
                    status_text = "Completed" if t['completed'] else "Pending"
                    
                    # Print to Console
                    print(f"      {status_icon} [{t['scheduled_date']}] {t['task_description']}")

                    # Add to CSV Data List
                    csv_rows.append([
                        u['id'], u['name'], u['email'],
                        a['id'], a['title'], a['due_date'],
                        t['id'], t['scheduled_date'], status_text, t['task_description']
                    ])

        conn.close()
        print("\n--- ✅ VERIFICATION COMPLETE ---")

        # [4] EXPORT TO CSV (If requested)
        if args.export:
            try:
                with open(args.export, mode='w', newline='', encoding='utf-8') as file:
                    writer = csv.writer(file)
                    writer.writerow(csv_headers)
                    writer.writerows(csv_rows)
                print(f"📂 Data successfully exported to: {args.export}")
            except Exception as e:
                print(f"❌ Failed to export CSV: {e}")

    except sqlite3.Error as e:
        print(f"❌ SQLite Error: {e}")

if __name__ == "__main__":
    run_check()