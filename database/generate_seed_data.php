<?php
/**
 * Script to generate 25+ records per table for Siva Murugan Chit Fund testing.
 */
require_once 'c:/xampp/htdocs/siva-murugan-chit-fund/backend/src/Core/App.php';
\App\Core\App::boot('c:/xampp/htdocs/siva-murugan-chit-fund/backend');

$db = \App\Core\Database::instance();

$sqlStatements = [];
$sqlStatements[] = "SET FOREIGN_KEY_CHECKS = 0;";

// 1. Customers
$locations = ['Madurai South', 'Madurai North', 'Tirunelveli', 'Theni', 'Dindigul', 'Virudhunagar', 'Sivakasi', 'Karaikudi'];
$names = [
    'Ramesh Kumar', 'Priya Dharshini', 'Suresh Babu', 'Vijay Kanth', 'Anitha Devi',
    'Karthik Raja', 'Lakshmi Narayanan', 'Saravanan M', 'Prakash Raj', 'Geetha K',
    'Mohan Ram', 'Meena Kumari', 'Vignesh P', 'Soundarya R', 'Bala Subramanian',
    'Kavitha S', 'Murugan V', 'Deepa Lakshmi', 'Gokul Nath', 'Sangeetha M',
    'Dinesh Kumar', 'Radhika S', 'Selvam P', 'Vasanth K', 'Uma Maheswari'
];

$sqlStatements[] = "-- Insert 25 Customers";
for ($i = 1; $i <= 25; $i++) {
    $code = sprintf('CUS%04d', $i);
    $name = $names[$i - 1];
    $mobile = sprintf('987654%04d', $i);
    $loc = $locations[($i - 1) % count($locations)];
    $gender = ($i % 2 === 0) ? 'female' : 'male';
    
    $sql = "INSERT INTO customers (id, customer_code, name, mobile, gender, location, status, created_at) VALUES ($i, '$code', '$name', '$mobile', '$gender', '$loc', 'active', '2026-01-01 10:00:00') ON DUPLICATE KEY UPDATE name='$name', mobile='$mobile', location='$loc';";
    $sqlStatements[] = $sql;
}

// 2. Chits (Loans / Chits)
$frequencies = ['monthly', 'monthly', 'weekly', 'daily'];
$statuses = ['active', 'active', 'active', 'completed', 'active'];

$sqlStatements[] = "-- Insert 25 Chits";
for ($i = 1; $i <= 25; $i++) {
    $code = sprintf('SM-%03d', $i);
    $custId = (($i - 1) % 25) + 1;
    $loc = $locations[($i - 1) % count($locations)];
    $principal = 100000 + (($i % 10) * 50000); // 1,00,000 to 5,50,000
    $tenure = 20;
    $freq = $frequencies[($i - 1) % count($frequencies)];
    $initialEmi = $principal / $tenure;
    $status = $statuses[($i - 1) % count($statuses)];
    $startDate = sprintf('2026-01-%02d', (($i - 1) % 20) + 1);

    $sql = "INSERT INTO loans_or_chits (id, code, account_type, customer_id, location, principal_amount, tenure, frequency, installment_amount, initial_emi_amount, emi_amount, start_date, schedule_type, status, created_by, created_at) VALUES ($i, '$code', 'chit', $custId, '$loc', $principal, $tenure, '$freq', $initialEmi, $initialEmi, $initialEmi, '$startDate', 'MONTHLY_INTERVAL', '$status', 1, '$startDate 10:00:00') ON DUPLICATE KEY UPDATE principal_amount=$principal, status='$status';";
    $sqlStatements[] = $sql;
}

// 3. Installments for all chits
$sqlStatements[] = "-- Insert Installments for all Chits";
$instGlobalId = 1;
for ($c = 1; $c <= 25; $c++) {
    $principal = 100000 + (($c % 10) * 50000);
    $tenure = 20;
    $emi = $principal / $tenure;
    $startDateStr = sprintf('2026-01-%02d', (($c - 1) % 20) + 1);
    $baseDate = new DateTimeImmutable($startDateStr);

    for ($n = 1; $n <= $tenure; $n++) {
        $dueDate = $baseDate->modify("+" . ($n - 1) . " month")->format('Y-m-d');
        
        // Determine status based on due date vs current date (2026-10-04)
        if ($n <= 5) {
            // Paid installments
            $paid = $emi;
            $bal = 0.00;
            $st = 'COMPLETED';
            $lastPaid = $dueDate;
        } elseif ($n === 6 && $c % 2 === 0) {
            // Partial
            $paid = $emi / 2;
            $bal = $emi / 2;
            $st = 'PARTIAL';
            $lastPaid = $dueDate;
        } elseif ($n <= 8 && $dueDate < '2026-10-04') {
            // Overdue
            $paid = 0.00;
            $bal = $emi;
            $st = 'OVERDUE';
            $lastPaid = 'NULL';
        } else {
            // Pending future
            $paid = 0.00;
            $bal = $emi;
            $st = 'PENDING';
            $lastPaid = 'NULL';
        }

        $lastPaidSql = $lastPaid === 'NULL' ? 'NULL' : "'$lastPaid'";

        $sql = "INSERT INTO installments (id, loan_id, installment_no, due_date, emi_amount, payable_amount, paid_amount, balance_amount, last_paid_date, status, created_at) VALUES ($instGlobalId, $c, $n, '$dueDate', $emi, $emi, $paid, $bal, $lastPaidSql, '$st', '$dueDate 10:00:00') ON DUPLICATE KEY UPDATE payable_amount=$emi, balance_amount=$bal, status='$st';";
        $sqlStatements[] = $sql;
        $instGlobalId++;
    }
}

// 4. Collections
$sqlStatements[] = "-- Insert Collections & Allocations";
$collId = 1;
$caId = 1;
for ($c = 1; $c <= 25; $c++) {
    $principal = 100000 + (($c % 10) * 50000);
    $emi = $principal / 20;
    $custId = (($c - 1) % 25) + 1;
    $loc = $locations[($c - 1) % count($locations)];

    for ($n = 1; $n <= 5; $n++) {
        $receipt = sprintf('REC-2026-%04d', $collId);
        $billNo = sprintf('BILL-%04d', $collId);
        $collDate = sprintf('2026-%02d-05', $n);
        $pm = ($collId % 2 === 0) ? 2 : 1; // UPI or Cash
        $acc = ($pm === 1) ? 1 : 2; // Office Cash or Bank

        $sql = "INSERT INTO collections (id, receipt_no, loan_id, customer_id, collected_by, employee_id, location, collection_date, amount, fine_amount, total_amount, payment_mode_id, account_id, bill_no, remarks, status, created_at) VALUES ($collId, '$receipt', $c, $custId, 1, 1, '$loc', '$collDate', $emi, 0.00, $emi, $pm, $acc, '$billNo', 'Regular installment payment', 'posted', '$collDate 11:00:00') ON DUPLICATE KEY UPDATE total_amount=$emi, status='posted';";
        $sqlStatements[] = $sql;

        // Allocation to installment
        $instId = (($c - 1) * 20) + $n;
        $sqlAlloc = "INSERT INTO collection_allocations (id, collection_id, installment_id, principal_alloc, fine_alloc, created_at) VALUES ($caId, $collId, $instId, $emi, 0.00, '$collDate 11:00:00') ON DUPLICATE KEY UPDATE principal_alloc=$emi;";
        $sqlStatements[] = $sqlAlloc;

        $collId++;
        $caId++;
    }
}

// 5. Distributions (Auction payouts)
$sqlStatements[] = "-- Insert 20 Distributions";
for ($d = 1; $d <= 20; $d++) {
    $chitId = $d;
    $custId = (($d - 1) % 25) + 1;
    $principal = 100000 + (($d % 10) * 50000);
    $distAmount = $principal * 0.85; // 85% payout after auction bid
    $distDate = sprintf('2026-%02d-15', (($d - 1) % 8) + 1);
    $acc = ($d % 2 === 0) ? 2 : 1;

    $sql = "INSERT INTO distributions (id, loan_id, customer_id, distributed_date, amount, account_id, remarks, status, created_by, created_at) VALUES ($d, $chitId, $custId, '$distDate', $distAmount, $acc, 'Auction distribution payout', 'active', 1, '$distDate 14:00:00') ON DUPLICATE KEY UPDATE amount=$distAmount, status='active';";
    $sqlStatements[] = $sql;
}

// 6. Office Income
$sqlStatements[] = "-- Insert 20 Office Income records";
$incCategories = ['Investment', 'Moi', 'Commission', 'Gift', 'Interest', 'Bonus'];
for ($i = 1; $i <= 20; $i++) {
    $amt = 5000 + ($i * 2500);
    $date = sprintf('2026-%02d-%02d', (($i - 1) % 8) + 1, (($i * 3) % 25) + 1);
    $cat = $incCategories[($i - 1) % count($incCategories)];
    $acc = ($i % 2 === 0) ? 1 : 2;

    $sql = "INSERT INTO office_income (id, amount, received_date, category, account_id, giver_details, remarks, status, created_by, created_at) VALUES ($i, $amt, '$date', '$cat', $acc, 'Partner / Sponsor $i', 'Office receipt #$i', 'active', 1, '$date 12:00:00') ON DUPLICATE KEY UPDATE amount=$amt;";
    $sqlStatements[] = $sql;
}

// 7. Expenses
$sqlStatements[] = "-- Insert 20 Expenses";
$expCategories = ['Office Rent', 'Fuel & Travel', 'Printing & Stationary', 'Tea & Snacks', 'Electricity', 'Maintenance', 'Staff Bonus'];
for ($e = 1; $e <= 20; $e++) {
    $amt = 1500 + ($e * 1200);
    $date = sprintf('2026-%02d-%02d', (($e - 1) % 8) + 1, (($e * 2) % 25) + 1);
    $cat = $expCategories[($e - 1) % count($expCategories)];
    $acc = ($e % 2 === 0) ? 1 : 2;

    $sql = "INSERT INTO expenses (id, amount, expense_date, category, account_id, remarks, status, created_by, created_at) VALUES ($e, $amt, '$date', '$cat', $acc, 'Office expense $cat #$e', 'active', 1, '$date 15:00:00') ON DUPLICATE KEY UPDATE amount=$amt;";
    $sqlStatements[] = $sql;
}

$sqlStatements[] = "SET FOREIGN_KEY_CHECKS = 1;";

$fullSql = implode("\n", $sqlStatements);

// Execute queries against MySQL
foreach ($sqlStatements as $stmt) {
    if (trim($stmt) !== '' && !str_starts_with(trim($stmt), '--')) {
        $db->pdo()->exec($stmt);
    }
}

file_put_contents('c:/xampp/htdocs/siva-murugan-chit-fund/database/migrations/20261004_133000_add_dummy_test_data.sql', $fullSql);
file_put_contents('c:/xampp/htdocs/siva-murugan-chit-fund/database/seed.sql', "\n\n" . $fullSql, FILE_APPEND);

echo "SUCCESSFULLY GENERATED AND SEEDED TEST DATA!" . PHP_EOL;
